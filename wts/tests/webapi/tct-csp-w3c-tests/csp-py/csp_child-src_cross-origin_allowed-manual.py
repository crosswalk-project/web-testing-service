def main(request, response):
    _URL = request.url
    _CSP = "child-src " + _URL[:_URL.index('/csp')+1]
    print _CSP
    response.headers.set("Content-Security-Policy", _CSP)
    response.headers.set("X-Content-Security-Policy", _CSP)
    response.headers.set("X-WebKit-CSP", _CSP)
    return """<!DOCTYPE html>
<!--
Copyright (c) 2013 Intel Corporation.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of works must retain the original copyright notice, this list
  of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the original copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.
* Neither the name of Intel Corporation nor the names of its contributors
  may be used to endorse or promote products derived from this work without
  specific prior written permission.

THIS SOFTWARE IS PROVIDED BY INTEL CORPORATION "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL INTEL CORPORATION BE LIABLE FOR ANY DIRECT,
INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Authors:
        Xu, Jianfeng <jianfengx.xu@intel.com>

-->

<html>
  <head>
    <title>CSP Test: csp_child-sr_cross-origin_allowed</title>
    <link rel="author" title="Intel" href="http://www.intel.com"/>
    <link rel="help" href="http://w3c.github.io/webappsec/specs/content-security-policy/csp-specification.dev.html#child-src"/>
    <meta name="flags" content=""/>
    <meta name="assert" content="child-src http://www.w3c.com"/>
    <meta charset="utf-8"/>
    <script src="../resources/server.js?pipe=sub"></script>
  </head>
  <body>
    <p>Test passes if there is <strong>red</strong>.</p>
    <iframe id="test" frameborder="no" border="0"></iframe>
    <script>
      document.getElementById("test").src =' """+ _URL[:_URL.index('/csp')+1] +"""csp/support/red-100x100.png';
    </script>
  </body>
</html> """
