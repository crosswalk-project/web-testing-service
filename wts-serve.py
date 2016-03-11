# -*- coding: utf-8 -*-
import sys
import os
import logging
import json
import socket
import signal
import threading
from multiprocessing import Process, Event
from collections import defaultdict, OrderedDict
import urllib2
import uuid
import argparse

sys.path.append("tools")

import sslutils
import time
import traceback

repo_root = os.path.abspath(os.path.split(__file__)[0])
service_doc_root = os.path.join(repo_root, "wts")

sys.path.insert(1, os.path.join(repo_root, "tools", "wptserve"))
from wptserve import server as wptserve, handlers
from wptserve import stash
from wptserve.router import any_method
sys.path.insert(1, os.path.join(repo_root, "tools", "pywebsocket", "src"))
from mod_pywebsocket import standalone as pywebsocket

routes = [(any_method, "*.py", handlers.python_script_handler),
          ("GET", "*.asis", handlers.as_is_handler),
          ("GET", "/*.json", handlers.file_handler),
          ("GET", "/tests", handlers.show_tests_dir_handler),
          ("GET", "/tests/*", handlers.file_handler),
          ("GET", "/resources/certificate", handlers.directory_handler),
          ("GET", "/resources/certificate/*", handlers.file_handler),
          ("GET", "/", handlers.show_index_handler),
          ("GET", "/runner", handlers.show_index_handler),
          ("GET", "/runner/", handlers.show_index_handler),
          ("GET", "/runner/*", handlers.file_handler),
          (any_method, "/*", handlers.ErrorHandler(404)),
          ("GET", "*", handlers.file_handler),
          ]

logger = None

def default_logger(level):
    logger = logging.getLogger("wts-tests")
    logging.basicConfig(level=getattr(logging, level.upper()))
    return logger

def open_socket(port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if port != 0:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(('127.0.0.1', port))
    sock.listen(5)
    return sock

def get_port():
    free_socket = open_socket(0)
    port = free_socket.getsockname()[1]
    logger.debug("Going to use port %s" % port)
    free_socket.close()
    return port

class ServerProc(object):
    def __init__(self):
        self.proc = None
        self.daemon = None
        self.stop = Event()

    def start(self, init_func, host, paths, port, bind_hostname, external_config,
              ssl_config):
        self.proc = Process(target=self.create_daemon,
                            args=(init_func, host, paths, port, bind_hostname,
                                  external_config, ssl_config))
        self.proc.daemon = True
        self.proc.start()

    def create_daemon(self, init_func, host, paths, port, bind_hostname,
                      external_config, ssl_config):
        try:
            self.daemon = init_func(host, paths, port, bind_hostname, external_config,
                                    ssl_config)
        except socket.error:
            print >> sys.stderr, "Socket error on port %s" % port
            raise
        except:
            print >> sys.stderr, traceback.format_exc()
            raise

        if self.daemon:
            try:
                self.daemon.start(block=False)
                try:
                    self.stop.wait()
                except KeyboardInterrupt:
                    pass
            except:
                print >> sys.stderr, traceback.format_exc()
                raise

    def wait(self):
        self.stop.set()
        self.proc.join()

    def kill(self):
        self.stop.set()
        self.proc.terminate()
        self.proc.join()

    def is_alive(self):
        return self.proc.is_alive()


def start_servers(host, paths, ports, bind_hostname, external_config, ssl_config):
    servers = defaultdict(list)

    for scheme, ports in ports.iteritems():
        assert len(ports) == {"http":2}.get(scheme, 1)

        for port in ports:
            if port is None:
                continue
            init_func = {"http":start_http_server,
                         "https":start_https_server,
                         "ws":start_ws_server,
                         "wss":start_wss_server}[scheme]

            server_proc = ServerProc()
            server_proc.start(init_func, host, paths, port, bind_hostname,
                              external_config, ssl_config)
            logger.info("Started server at %s://%s:%s" % (scheme, host, port))
            servers[scheme].append((port, server_proc))

    return servers

def start_http_server(host, paths, port, bind_hostname, external_config, ssl_config):
    return wptserve.WebTestHttpd(host=host,
                                 port=port,
                                 doc_root=paths["doc_root"],
                                 routes=routes,
                                 bind_hostname=bind_hostname,
                                 config=external_config,
                                 use_ssl=False,
                                 key_file=None,
                                 certificate=None)


def start_https_server(host, paths, port, bind_hostname, external_config, ssl_config):
    return wptserve.WebTestHttpd(host=host,
                                 port=port,
                                 doc_root=paths["doc_root"],
                                 routes=routes,
                                 bind_hostname=bind_hostname,
                                 config=external_config,
                                 use_ssl=True,
                                 key_file=ssl_config["key_path"],
                                 certificate=ssl_config["cert_path"],
                                 encrypt_after_connect=ssl_config["encrypt_after_connect"])

class WebSocketDaemon(object):
    def __init__(self, host, port, doc_root, handlers_root, log_level, bind_hostname,
                 ssl_config):
        self.host = host
        cmd_args = ["-p", port,
                    "-d", doc_root,
                    "-w", handlers_root,
                    "--log-level", log_level]

        if ssl_config is not None:
            # This is usually done through pywebsocket.main, however we're
            # working around that to get the server instance and manually
            # setup the wss server.
            if pywebsocket._import_ssl():
                tls_module = pywebsocket._TLS_BY_STANDARD_MODULE
            elif pywebsocket._import_pyopenssl():
                tls_module = pywebsocket._TLS_BY_PYOPENSSL
            else:
                print "No SSL module available"
                sys.exit(1)

            cmd_args += ["--tls",
                         "--private-key", ssl_config["key_path"],
                         "--certificate", ssl_config["cert_path"],
                         "--tls-module", tls_module]

        if (bind_hostname):
            cmd_args = ["-H", host] + cmd_args
        opts, args = pywebsocket._parse_args_and_config(cmd_args)
        opts.cgi_directories = []
        opts.is_executable_method = None
        os.chdir(opts.document_root)
        self.server = pywebsocket.WebSocketServer(opts)
        ports = [item[0].getsockname()[1] for item in self.server._sockets]
        assert all(item == ports[0] for item in ports)
        self.port = ports[0]
        self.started = False
        self.server_thread = None

    def start(self, block=False):
        logger.info("Starting websockets server on %s:%s" % (self.host, self.port))
        self.started = True
        if block:
            self.server.serve_forever()
        else:
            self.server_thread = threading.Thread(target=self.server.serve_forever)
            self.server_thread.setDaemon(True)  # don't hang on exit
            self.server_thread.start()

    def stop(self):
        """
        Stops the server.

        If the server is not running, this method has no effect.
        """
        if self.started:
            try:
                self.server.shutdown()
                self.server.server_close()
                self.server_thread.join()
                self.server_thread = None
                logger.info("Stopped websockets server on %s:%s" % (self.host, self.port))
            except AttributeError:
                pass
            self.started = False
        self.server = None

def start_ws_server(host, paths, port, bind_hostname, external_config, ssl_config):
    return WebSocketDaemon(host,
                           str(port),
                           paths["ws_doc_root"],
                           paths["ws_handlers_root"],
                           "debug",
                           bind_hostname,
                           ssl_config = None)

def start_wss_server(host, paths, port, bind_hostname, external_config, ssl_config):
    return WebSocketDaemon(host,
                           str(port),
                           paths["ws_doc_root"],
                           paths["ws_handlers_root"],
                           "debug",
                           bind_hostname,
                           ssl_config)

def get_ports(config, ssl_environment):
    rv = defaultdict(list)
    for scheme, ports in config["ports"].iteritems():
        for i, port in enumerate(ports):
            if scheme in ["wss", "https"] and not ssl_environment.ssl_enabled:
                port = None
            if port == "auto":
                port = get_port()
            else:
                port = port
            rv[scheme].append(port)
    return rv

def normalise_config(config, ports):
    host = config["external_host"] if config["external_host"] else config["host"]
    ports_ = {}
    for scheme, ports_used in ports.iteritems():
        ports_[scheme] = ports_used

    domains = {}
    domains[""] = host

    ports_ = {}
    for scheme, ports_used in ports.iteritems():
        ports_[scheme] = ports_used

    return {"host": host,
            "domains": domains,
            "ports": ports_}

def get_ssl_config(config, external_domains, ssl_environment):
    key_path, cert_path = ssl_environment.host_cert_path(external_domains)
    return {"key_path": key_path,
            "cert_path": cert_path,
            "encrypt_after_connect": config["ssl"]["encrypt_after_connect"]}

def start(config, ssl_environment):
    host = config["host"]
    ports = get_ports(config, ssl_environment)
    bind_hostname = config["bind_hostname"]

    paths = {"doc_root": config["doc_root"],
             "ws_doc_root": config["ws_doc_root"],
             "ws_handlers_root": config["ws_handlers_root"]}

    external_config = normalise_config(config, ports)

    ssl_config = get_ssl_config(config, external_config["domains"].values(), ssl_environment)

    servers = start_servers(host, paths, ports, bind_hostname, external_config,
                            ssl_config)
    return external_config, servers

def iter_procs(servers):
    for servers in servers.values():
        for port, server in servers:
            yield server.proc

def value_set(config, key):
    return key in config and config[key] is not None

def get_value_or_default(config, key, default=None):
    return config[key] if value_set(config, key) else default

def set_computed_defaults(config):
    if not value_set(config, "ws_doc_root"):
        config["ws_doc_root"] = os.path.join(service_doc_root, "resources", "websocket")

    if not value_set(config, "ws_handlers_root"):
        config["ws_handlers_root"] = os.path.join(service_doc_root, "tests", "websocket", "w3c", "handlers")

    if not value_set(config, "doc_root"):
        config["doc_root"] = service_doc_root

def get_ssl_environment(config):
    implementation_type = config["ssl"]["type"]
    cls = sslutils.environments[implementation_type]
    try:
        kwargs = config["ssl"][implementation_type].copy()
    except KeyError:
        raise ValueError("%s is not a vaid ssl type." % implementation_type)
    return cls(logger, **kwargs)

def load_config(path):
    if os.path.exists(path):
        with open(path) as f:
            rv = json.load(f)
    else:
        raise ValueError("Config path %s does not exist" % path)

    set_computed_defaults(rv)
    return rv

def main():
    global logger

    config = load_config(os.path.join(repo_root, "config.json"))
    logger = default_logger(config["log_level"])

    with stash.StashServer((config["host"], get_port()), authkey=str(uuid.uuid4())):
        with get_ssl_environment(config) as ssl_env:
            config_, servers = start(config, ssl_env)

            try:
                while any(item.is_alive() for item in iter_procs(servers)):
                    for item in iter_procs(servers):
                        item.join(1)
            except KeyboardInterrupt:
                logger.info("Shutting down")

if __name__ == "__main__":
    main()
