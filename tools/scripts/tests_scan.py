import os
from collections import defaultdict
import re
import argparse
import json
import logging

exclude_php_hack = False
blacklist = ["/", "/common/", "/resources/"]

logging.basicConfig()
logger = logging.getLogger("wts-tests")
logger.setLevel(logging.DEBUG)

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
        rv = {"url":self.url}
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
            raise ValueError, "Unrecognised ref_type %s" % ref_type
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
        self._data = dict((item_type, defaultdict(set)) for item_type in self.item_types)

    def contains_path(self, path):
        return any(path in item for item in self._data.itervalues())

    def add(self, item):
        self._data[item.item_type][item.url].add(item)

    def extend(self, items):
        for item in items:
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

        rv = {"items":items}
        return rv

    @classmethod
    def from_json(cls, obj):
        self = cls()
        if not hasattr(obj, "iteritems"):
            raise ManifestError

        item_classes = {"testharness":TestharnessTest,
                        "reftest":RefTest,
                        "manual":ManualTest}

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


def get_manifest_items(rel_path):
    if rel_path.endswith(os.path.sep):
        return []

    url = "/" + rel_path.replace(os.sep, "/")
    path = "%s/%s" % (get_root(), rel_path)

    if not os.path.exists(path):
        return []

    base_path, filename = os.path.split(path)
    name, ext = os.path.splitext(filename)

    file_markup_type = markup_type(ext)

    if filename.startswith("manifest1") or filename.startswith("."):
        return []

    for item in blacklist:
        if item == "/":
            if "/" not in url[1:]:
                return []
        elif url.startswith("/tests" + item):
            return []

    ref_list = []
        
    if file_markup_type:
        if name.lower().endswith("-manual"):
            if file_markup_type == 'py':
                return [ManualTest(url)]
                
            parser = {"html":lambda x:html5lib.parse(x, treebuilder="etree"),
                      "xhtml":ElementTree.parse,
                      "svg":ElementTree.parse}[file_markup_type]
            try:
                with open(path) as f:
                    tree = parser(f)
            except:
                logger.info("Helper file: %s" % url)
                return []
    
            if hasattr(tree, "getroot"):
                root = tree.getroot()
            else:
                root = tree
                
            match_links = root.findall(".//{http://www.w3.org/1999/xhtml}link[@rel='match']")
            mismatch_links = root.findall(".//{http://www.w3.org/1999/xhtml}link[@rel='mismatch']")

            if not match_links + mismatch_links:
                return [ManualTest(url)]
                
            for item in match_links + mismatch_links:
                ref_url = "/%s/%s" % (os.path.dirname(rel_path), item.attrib["href"])
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
                    logger.info("Helper file: %s" % url)
                    return []

        if exclude_php_hack:
            php_re =re.compile("\.php")
            with open(path) as f:
                text = f.read()
                if php_re.findall(text):
                    return []

        parser = {"html":lambda x:html5lib.parse(x, treebuilder="etree"),
                  "xhtml":ElementTree.parse,
                  "svg":ElementTree.parse}[file_markup_type]
        try:
            with open(path) as f:
                tree = parser(f)
        except:
            logger.info("Helper file: %s" % url)
            return []

        if hasattr(tree, "getroot"):
            root = tree.getroot()
        else:
            root = tree

        for script_el in root.findall(".//{http://www.w3.org/1999/xhtml}script"):
            if script_el.get('src'):
                if script_el.get('src').find("testharness.js") != -1 \
                    or script_el.get('src').find("resources/unit.js") != -1 \
                    or script_el.get('src').find("js-test-pre.js") != -1 \
                    or script_el.get('src').find("qunit.js") != -1:
                        return [TestharnessTest(url)]

        match_links = root.findall(".//{http://www.w3.org/1999/xhtml}link[@rel='match']")
        mismatch_links = root.findall(".//{http://www.w3.org/1999/xhtml}link[@rel='mismatch']")

        for item in match_links + mismatch_links:
            ref_url = "/%s/%s" % (os.path.dirname(rel_path), item.attrib["href"])
            ref_type = "==" if item.attrib["rel"] == "match" else "!="
            reftest = RefTest(url, ref_url, ref_type)
            if reftest not in ref_list:
                ref_list.append(reftest)

        return ref_list

    logger.info("Helper file: %s" % url)
    return []


def abs_path(path):
    return os.path.abspath(path)


def get_root():
    file_path = os.path.abspath(__file__)
    file_path = os.path.split(file_path)[0] + '/../../wts'
    return file_path


def load(manifest_path):
    if os.path.exists(manifest_path):
        logger.debug("Opening manifest at %s" % manifest_path)
    else:
        logger.debug("Creating new manifest at %s" % manifest_path)
    try:
        with open(manifest_path) as f:
            manifest = Manifest.from_json(json.load(f))
    except IOError:
        manifest = Manifest()

    return manifest


def update(manifest, path):
    global ElementTree
    global html5lib

    try:
        from xml.etree import cElementTree as ElementTree
    except ImportError:
        from xml.etree import ElementTree

    import html5lib

    for root, dirs, files in os.walk(path):
        for fn in files:
            full_path = "%s/%s" % (root, fn)
            relative_path = full_path.split('/../../wts/')[1]
            manifest.extend(get_manifest_items(relative_path))


def write(manifest, manifest_path, opts):
    with open(manifest_path, "w") as f:
        if opts.not_minimize:
            json.dump(manifest.to_json(), f, indent=2)
        else:
            json.dump(manifest.to_json(), f, separators=(',', ':'))

def update_manifest(opts):
    logger.info("Generating manifest json")
    manifest = Manifest()
    tests_path = get_root() + '/tests'
    update(manifest, tests_path)
    write(manifest, os.path.join(opts.path, "manifest1.json"), opts)


def get_parser():
    parser = argparse.ArgumentParser()

    parser.add_argument("--path", default=os.path.join(get_root(),  "tests"),
                        help="JSON path")
                        
    parser.add_argument("--not-minimize",
                        dest="not_minimize", help="not minimize the json file")
    return parser


def update_selection(opts):
    logger.info("Generating selection json")
    selection_json = os.path.join(opts.path, "manifest0.json")
    selection_info_dic = {}
    path = get_root()
    for spec_item in os.listdir("%s/tests" % path):
        spec_json =  "%s/tests/%s/spec.json" % (path, spec_item)

        if os.path.isfile(spec_json):
            with open(spec_json) as f:
                spec_info_dic = json.load(f)
                spec_info = spec_info_dic[spec_item]
                category = spec_info['spec_category']
                del spec_info['spec_category']

                if category not in selection_info_dic.keys():
                    selection_info_dic[category] = {}
                selection_info_dic[category][spec_item] = spec_info

    selection_json = open(selection_json, 'w')
    if opts.not_minimize:
        content = json.dumps(selection_info_dic, sort_keys=True, indent=2)
    else:
        content = json.dumps(selection_info_dic, sort_keys=True, separators=(',', ':'))
    selection_json.write(content)
    selection_json.close()


def generate_json():
    opts = get_parser().parse_args()
    update_manifest(opts)
    update_selection(opts)

def main():
    generate_json()

if __name__ == "__main__":
    main()
