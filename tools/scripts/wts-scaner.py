#!/usr/bin/env python

import os
import sys
import re
import argparse
import json
import logging
import html5lib
import logging
import string
from optparse import OptionParser
from collections import defaultdict

try:
    from xml.etree import cElementTree as ElementTree
except ImportError:
    from xml.etree import ElementTree

exclude_php_hack = False
blacklist = ["/", "/common/", "/resources/"]
scaner_opts = None
LOG = None


class ColorFormatter(logging.Formatter):

    def __init__(self, msg):
        logging.Formatter.__init__(self, msg)

    def format(self, record):
        red, green, yellow, blue = range(4)
        colors = {'INFO': blue, 'DEBUG': green,
                  'WARNING': yellow, 'ERROR': red}
        msg = record.msg
        if msg[0] == "*":
            msg = "\33[01m" + msg[1:] + "\033[0m"
        elif msg[0] == "+":
            msg = "\33[07m" + msg[1:] + "\033[0m"
        elif msg[0] == "(" and msg[2] == ")":
            msg_prefix = "".join("--" for i in range(string.atoi(msg[1])))
            msg = msg_prefix + "| " + msg[3:]

        levelname = record.levelname
        if levelname in colors:
            msg_color = "\033[0;%dm" % (
                31 + colors[levelname]) + msg + "\033[0m"
            record.msg = msg_color

        return logging.Formatter.format(self, record)


class ManifestItem(object):
    item_type = None

    def __init__(self, url):
        self.url = url
        self.id = self.url

    def _key(self):
        return self.item_type, self.url

    def __eq__(self, other):
        if not hasattr(other, "_key"):
            return False
        return self._key() == other._key()

    def __hash__(self):
        return hash(self._key())

    def to_json(self):
        rv = {"url": self.url}
        return rv

    @classmethod
    def from_json(self, obj):
        raise NotImplementedError


class TestharnessTest(ManifestItem):
    item_type = "testharness"

    def __init__(self, url):
        ManifestItem.__init__(self, url)

    def to_json(self):
        rv = ManifestItem.to_json(self)
        return rv

    @classmethod
    def from_json(cls, obj):
        return cls(obj["url"])


class RefTest(ManifestItem):
    item_type = "reftest"

    def __init__(self, url, ref_url, ref_type):
        if ref_type not in ["==", "!="]:
            raise ValueError("Unrecognised ref_type %s" % ref_type)
        ManifestItem.__init__(self, url)
        self.ref_url = ref_url
        self.ref_type = ref_type
        self.id = (self.url, self.ref_type, self.ref_url)

    def _key(self):
        return self.item_type, self.url, self.ref_type, self.ref_url

    def to_json(self):
        rv = ManifestItem.to_json(self)
        rv.update({"ref_type": self.ref_type,
                   "ref_url": self.ref_url})
        return rv

    @classmethod
    def from_json(cls, obj):
        return cls(obj["url"], obj["ref_url"], obj["ref_type"])


class ManualTest(ManifestItem):
    item_type = "manual"

    @classmethod
    def from_json(cls, obj):
        return cls(obj["url"])


class ManifestError(Exception):
    pass


class Manifest(object):

    def __init__(self):
        self.item_types = ["testharness", "reftest",
                           "manual"]
        self._data = dict((item_type, defaultdict(set))
                          for item_type in self.item_types)

    def contains_path(self, path):
        return any(path in item for item in self._data.itervalues())

    def add(self, item):
        self._data[item.item_type][item.url].add(item)

    def extend(self, items):
        for item in items:
            LOG.debug("(2)Add Item: %s" % item.url)
            LOG.debug("(4)Item Type: %s" % item.item_type)
            self.add(item)

    def remove_path(self, url):
        for item_type in self.item_types:
            if url in self._data[item_type]:
                del self._data[item_type][url]

    def itertypes(self, *types):
        for item_type in types:
            for item in sorted(self._data[item_type].items()):
                yield item

    def __iter__(self):
        for item_type in self.item_types:
            for item in self._data[item_type].iteritems():
                yield item

    def __getitem__(self, key):
        for items in self._data.itervalues():
            if key in items:
                return items[key]
        raise KeyError

    def to_json(self):
        items = defaultdict(list)
        for test_path, tests in self.itertypes(*self.item_types):
            for test in tests:
                items[test.item_type].append(test.to_json())

        rv = {"items": items}
        return rv

    @classmethod
    def from_json(cls, obj):
        self = cls()
        if not hasattr(obj, "iteritems"):
            raise ManifestError

        item_classes = {"testharness": TestharnessTest,
                        "reftest": RefTest,
                        "manual": ManualTest}

        for k, values in obj["items"].iteritems():
            if k not in self.item_types:
                raise ManifestError
            for v in values:
                manifest_item = item_classes[k].from_json(v)
                self.add(manifest_item)
        return self


def markup_type(ext):
    if not ext:
        return None

    if ext[0] == ".":
        ext = ext[1:]

    if ext in ["html", "htm"]:
        return "html"
    elif ext in ["xhtml", "xht"]:
        return "xhtml"
    elif ext == "svg":
        return "svg"
    elif ext == "py":
        return "py"
    return None


def get_manifest_items(path):
    rel_path = os.path.join("tests/", path.split(scaner_opts.testsfolder+os.sep)[1]).replace(os.sep, "/")
    url = os.path.join("/", rel_path).replace(os.sep, "/")

    base_path, filename = os.path.split(path)
    name, ext = os.path.splitext(filename)

    file_markup_type = markup_type(ext)

    if filename.startswith("manifest1") or filename.startswith("."):
        return None

    for item in blacklist:
        if item == "/":
            if "/" not in url[1:]:
                return None
        elif url.startswith("/tests" + item):
            return None

    ref_list = []

    if file_markup_type:
        if name.lower().endswith("-manual"):
            if file_markup_type == 'py':
                return [ManualTest(url)]

            parser = {"html": lambda x: html5lib.parse(x, treebuilder="etree"),
                      "xhtml": ElementTree.parse,
                      "svg": ElementTree.parse}[file_markup_type]
            try:
                with open(path) as f:
                    tree = parser(f)
            except:
                return None

            if hasattr(tree, "getroot"):
                root = tree.getroot()
            else:
                root = tree

            match_links = root.findall(
                ".//{http://www.w3.org/1999/xhtml}link[@rel='match']")
            mismatch_links = root.findall(
                ".//{http://www.w3.org/1999/xhtml}link[@rel='mismatch']")

            if not match_links + mismatch_links:
                return [ManualTest(url)]

            for item in match_links + mismatch_links:
                ref_url = os.path.join("/", os.path.dirname(rel_path),
                                      item.attrib["href"]).replace(os.sep, "/")
                ref_type = "==" if item.attrib["rel"] == "match" else "!="
                reftest = RefTest(url, ref_url, ref_type)
                if reftest not in ref_list:
                    ref_list.append(reftest)
            return ref_list

        if file_markup_type == 'py':
            with open(path) as f:
                if f.read().find('testharness.js') != -1:
                    return [TestharnessTest(url)]
                else:
                    return None

        if exclude_php_hack:
            php_re = re.compile("\.php")
            with open(path) as f:
                text = f.read()
                if php_re.findall(text):
                    return None

        parser = {"html": lambda x: html5lib.parse(x, treebuilder="etree"),
                  "xhtml": ElementTree.parse,
                  "svg": ElementTree.parse}[file_markup_type]
        try:
            with open(path) as f:
                tree = parser(f)
        except:
            return None

        if hasattr(tree, "getroot"):
            root = tree.getroot()
        else:
            root = tree

        for script_el in root.findall(
                ".//{http://www.w3.org/1999/xhtml}script"):
            if script_el.get('src'):
                if script_el.get('src').find("testharness.js") != -1 \
                        or script_el.get('src').find("resources/unit.js") != -1 \
                        or script_el.get('src').find("js-test-pre.js") != -1 \
                        or script_el.get('src').find("qunit.js") != -1:
                    return [TestharnessTest(url)]

        match_links = root.findall(
            ".//{http://www.w3.org/1999/xhtml}link[@rel='match']")
        mismatch_links = root.findall(
            ".//{http://www.w3.org/1999/xhtml}link[@rel='mismatch']")

        for item in match_links + mismatch_links:
            ref_url = os.path.join("/", os.path.dirname(rel_path),
                                      item.attrib["href"]).replace(os.sep, "/")
            ref_type = "==" if item.attrib["rel"] == "match" else "!="
            reftest = RefTest(url, ref_url, ref_type)
            if reftest not in ref_list:
                ref_list.append(reftest)

        return ref_list

    return None


def do_remove(target_file_list=None):
    for i_file in target_file_list:
        try:
            if os.path.isdir(i_file):
                shutil.rmtree(i_file)
            else:
                os.remove(i_file)
        except Exception as e:
            return False
    return True


def write_manifest(i_json=None, json_file=None):
    if not i_json:
        LOG.warn("Skip writing empty json to %s" % json_file)
        return False

    if not scaner_opts.bstripjson:
        updated_json_tmp = json.dumps(
            i_json,
            indent=4,
            sort_keys=True)
    else:
        updated_json_tmp = json.dumps(
            i_json,
            sort_keys=True,
            separators=(',', ':'))

    updated_json = None
    for i_line in updated_json_tmp.splitlines():
        i_line = i_line.rstrip()
        if i_line:
            if updated_json:
                updated_json = "%s\n%s" % (updated_json, i_line)
            else:
                updated_json = i_line

    if not updated_json:
        LOG.error("Failed to strip json")

    try:
        if os.path.exists(json_file):
            LOG.warn("Delete the existing file %s" % json_file)
            do_remove([json_file])
        with open(json_file, "w") as original_json_file:
            original_json_file.write(updated_json)
            original_json_file.close()
    except Exception as e:
        LOG.error("Failed to write file %s, %s" % (json_file, e))
        return True

    LOG.info("Saved JSON file %s" % json_file)
    return False


def update_manifest1():
    LOG.info("+Generating manifest1 json")
    manifest = Manifest()

    for root, dirs, files in os.walk(scaner_opts.testsfolder):
        for fn in files:
            items = get_manifest_items(os.path.join(root, fn))
            if items:
                manifest.extend(items)
            else:
                LOG.debug(
                    "Skip to get the test item from %s" %
                    os.path.join(
                        root,
                        fn))

    tests_files_num = 0
    for i_type in manifest.to_json()["items"].keys():
        LOG.info(
            "(2)%s: Total %d test files" %
            (i_type, len(manifest.to_json()["items"][i_type])))
        tests_files_num += len(manifest.to_json()["items"][i_type])
    LOG.info("Total %d test files" % tests_files_num)

    if write_manifest(
            manifest.to_json(),
            os.path.join(scaner_opts.testsfolder, "manifest1.json")):
        return True
    return False


def update_manifest0():
    LOG.info("+Generating manifest0.json")
    manifest0_json = os.path.join(scaner_opts.testsfolder, "manifest0.json")
    manifest0_info_dic = {}
    for spec_item in os.listdir(scaner_opts.testsfolder):
        spec_json = os.path.join(
            scaner_opts.testsfolder,
            spec_item,
            "spec.json")
        try:
            if os.path.isfile(spec_json):
                with open(spec_json) as json_f:
                    spec_info_dic = json.load(json_f)
                    json_f.close()
                    spec_info = spec_info_dic[spec_item]
                    category = spec_info['spec_category']
                    del spec_info['spec_category']
                    del spec_info['spec_maturity']

                    if category not in manifest0_info_dic.keys():
                        manifest0_info_dic[category] = {}
                    manifest0_info_dic[category][spec_item] = spec_info
                    LOG.debug("(2)Reading %s" % spec_item)
                    LOG.debug("(4)Specification Folder: %s" % spec_item)
                    LOG.debug(
                        "(4)Specification Desc: %s" %
                        spec_info['spec_desc'])
                    LOG.debug(
                        "(4)Specification URL: %s" %
                        spec_info['spec_url'])
                    LOG.debug("(4)Specification catefory: %s" % category)
            else:
                LOG.debug(
                    "Skip %s folder for manifest0.json scanning" %
                    os.path.join(
                        scaner_opts.testsfolder,
                        spec_item))
        except Exception as e:
            LOG.error("Fail to read %s: %s" % (spec_json, e))
            return True

    categories_num = 0
    specifications_num = 0
    for i_category in manifest0_info_dic.keys():
        LOG.info("(2)%s" % i_category)
        categories_num += 1
        for i_spec in manifest0_info_dic[i_category]:
            specifications_num += 1
            LOG.info("(4)%s" % i_spec)
    LOG.info("Totally %d categories and %d specifications" % (categories_num, specifications_num))

    if write_manifest(manifest0_info_dic, manifest0_json):
        return True
    return False


def main():
    global LOG
    global scaner_opts

    try:
        usage = "Usage: ./wts_scaner -t ../../wts/tests -s --debug"
        opts_parser = OptionParser(usage=usage)
        opts_parser.add_option(
            "-t",
            "--tests-folder",
            dest="testsfolder",
            help="specify the folder of tests files")
        opts_parser.add_option(
            "-s",
            "--strip-json",
            dest="bstripjson",
            action="store_true",
            help="strip json file")
        opts_parser.add_option(
            "--debug",
            dest="bdebug",
            action="store_true",
            help="enable debug mode")

        if len(sys.argv) == 1:
            sys.argv.append("-h")

        (scaner_opts, args) = opts_parser.parse_args()
    except Exception as e:
        LOG.error("Got wrong options: %s, exit ..." % e)
        sys.exit(1)

    if scaner_opts.bdebug:
        log_level = logging.DEBUG
    else:
        log_level = logging.INFO
    LOG = logging.getLogger("wts_scaner")
    LOG.setLevel(log_level)
    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(log_level)
    stream_formatter = ColorFormatter("[WTS Scaner] %(message)s")
    stream_handler.setFormatter(stream_formatter)
    LOG.addHandler(stream_handler)

    if update_manifest0():
        sys.exit(1)
    if update_manifest1():
        sys.exit(1)

if __name__ == "__main__":
    main()
