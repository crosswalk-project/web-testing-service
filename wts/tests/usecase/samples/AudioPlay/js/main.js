/*
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
        Cui,Jieqiong <jieqiongx.cui@intel.com>

*/

var testTarget;

$(document).ready(function(){
    $("#slider-1").slider({
	    tooltip: 'always'
    });
    $("#playback-1").slider({
	    tooltip: 'always'
    });
    $(".tooltip-arrow").css("border-top-color","#D3D0D0");
    $(".tooltip-inner").css({"color":"black","background-color":"#D3D0D0"});
    DisablePassButton();
    document.getElementById("MediaPlayback").volume = 0.6;
    document.getElementById("MediaPlayback").playbackRate = 1;
    $("#slider-1").hide();
});

function play() {
    EnablePassButton();
    testTarget=document.getElementById("MediaPlayback");
    testTarget.play();
}

function pause() {
    testTarget=document.getElementById("MediaPlayback");
    testTarget.pause();
}

function replay() {
  document.getElementById("MediaPlayback").load();
  testTarget.play();
}
