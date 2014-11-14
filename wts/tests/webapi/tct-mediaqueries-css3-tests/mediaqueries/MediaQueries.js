/*
 Copyright (c) 2012 Intel Corporation.

 Redistribution and use in source and binary forms, with or without modification,
 are permitted provided that the following conditions are met:

 *Redistributions of works must retain the original copyright notice, this list
 of conditions and the following disclaimer.
 *Redistributions in binary form must reproduce the original copyright notice,
 this list of conditions and the following disclaimer in the documentation
 and/or other materials provided with the distribution.
 *Neither the name of Intel Corporation nor the names of its contributors
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
 Wang,Ling <lingx.z.wang@intel.com>

 Revision history:
 Date               Author                                     Description
 21-08-2012         Wang,Ling <lingx.z.wang@intel.com>         case creation

*/

// JavaScript Document
function GetCurrentStyle(prop) {
    var div = document.querySelector("#media");
    propprop = headProp(prop);
    return getComputedStyle(div)[propprop];
}
function headProp(s) {
var div = document.querySelector("#media");
    if (s in div.style) {
        return s;
    }
    s = s[0].toUpperCase() + s.slice(1);
    var prefixes = ["ms", "Moz", "moz", "webkit", "O"];
    for (var i = 0; i < prefixes.length; i++) {
        if ((prefixes[i] + s) in div.style) {
            return prefixes[i] + s;
        }
    }
    return s;
}
//
function getfilename(path)
{
    var indexlast=path.lastIndexOf("/");
    var indexlast1=path.lastIndexOf("\"");
    var indexlast2=path.lastIndexOf(")");
    indexlast1=indexlast1>indexlast2?indexlast1:indexlast2;
    return path.substring(indexlast+1,indexlast1);
}
//

function assert_equals(color,expected,disc) {
    t.step(function () { assert_equals(color, expected, disc); } );
    t.done();
}

function assert_true(expected, disc) {
    t.step(function () { assert_true(expected, disc); } );
    t.done();
}
