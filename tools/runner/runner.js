/*jshint nonew: false */
(function() {
"use strict";
var runner;
var testharness_properties = {output:false,
                              timeout_multiplier:1};

function Manifest(path) {
    this.data = null;
    this.path = path;
    this.num_tests = null;
}

Manifest.prototype = {
    load: function(loaded_callback) {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== 4) {
                return;
            }
            if (!(xhr.status === 200 || xhr.status === 0)) {
                throw new Error("Manifest " + this.path + " failed to load");
            }
            this.data = JSON.parse(xhr.responseText);
            loaded_callback();
        }.bind(this);
        xhr.open("GET", this.path);
        xhr.send(null);
    },

    by_type:function(type) {
        if (this.data.items.hasOwnProperty(type)) {
            return this.data.items[type];
        } else {
            return [];
        }
    }
};

function ManifestIterator(manifest, filter_array, test_types) {
    this.manifest = manifest;
    this.filter_array = filter_array
    this.test_types = test_types;
    this.test_index = 0;
    this.filter_tests = new Array();
    this.filter_cases();
}

ManifestIterator.prototype = {
    filter_cases: function(){
        var mfitor = this;
        this.test_types.forEach(function(test_type){
            this.manifest.by_type(test_type).forEach(function(Mitem){
                if(Mitem&&this.matches(Mitem)){
                    this.filter_tests.push(this.to_test(Mitem,test_type))
                }
            }.bind(this));
        }.bind(this));
    },
    next:function(){
        if (this.filter_tests.length === 0){
            return null;
        }
        if (this.test_index < this.filter_tests.length){
            return this.filter_tests[this.test_index++];
        }else{
            return null;
        }
    },
    prev:function(){
        this.test_index--;
        this.test_index--;
        if (this.test_index>=0){
            var pre_case = this.next();
            console.log('prev',pre_case);
            return pre_case;
        }
    },

    matches: function(manifest_item) {
        var filter_status = false;
        this.filter_array.forEach(function(value){
            var prefix = "/tests/";
            filter_status = filter_status||manifest_item.url.indexOf(value) == prefix.length;
        }.bind(this));
        return filter_status;
    },

    to_test: function(manifest_item,test_type) {
        var test = {
            type: test_type,
            url: manifest_item.url
        };
        if (manifest_item.hasOwnProperty("ref_url")) {
            test.ref_type = manifest_item.ref_type;
            test.ref_url = manifest_item.ref_url;
        }
        return test;
    },

    count: function() {
        return this.test_types.reduce(function(prev, current) {
            var matches = this.manifest.by_type(current).filter(function(x) {
                return this.matches(x);
            }.bind(this));
            return prev + matches.length;
        }.bind(this), 0);
    }
};

function VisualOutput(elem, runner) {
    this.elem = elem;
    this.runner = runner;
    this.results_table = null;
    this.section_wrapper = null;
    this.results_table = this.elem.querySelector(".results > div > table");
    this.section = null;
    this.progress = this.elem.querySelector(".summary .progress");
    this.meter = this.progress.querySelector(".progress-bar");
    this.result_count = null;
    this.json_re_area = this.elem.querySelector("textarea");

    this.elem.style.display = "none";
    this.runner.start_callbacks.push(this.on_start.bind(this));
    this.runner.result_callbacks.push(this.on_result.bind(this));
    this.runner.done_callbacks.push(this.on_done.bind(this));
}

VisualOutput.prototype = {
    clear: function() {
        this.result_count = {"PASS":0,
                             "FAIL":0,
                             "BLOCK":0};
        for (var p in this.result_count) {
            if (this.result_count.hasOwnProperty(p)) {
                this.elem.querySelector("td." + p).textContent = 0;
            }
        }
        if (this.json_re_area) {
            this.json_re_area.parentNode.removeChild(this.json_re_area);
        }
        this.elem.querySelector(".jsonResults").style.display = "none";
        this.meter.style.width = '0px';
        this.meter.textContent = '0%';
        this.results_table.removeChild(this.results_table.tBodies[0]);
        this.results_table.appendChild(document.createElement("tbody"));
    },

    on_start: function() {
        this.clear();
        this.elem.style.display = "block";
        this.meter.classList.add("progress-striped", "active");
    },

    on_result:function(test, status, message, subtests){
        var have_old = 0;
        Array.prototype.slice.call(this.results_table.querySelectorAll("tr")).forEach(function(dom){
            if(dom.className==test.url){
                var td_arr = Array.prototype.slice.call(dom.querySelectorAll("td"));
                var status_node = td_arr[1];
                var message_node = td_arr[2];
                var subtests_node = td_arr[3];
                this.result_count[status_node.className] -= 1;
                if (status == "OK" || status == "PASS"){
                    status = "PASS";
                }
                status_node.className = status;
                status_node.textContent = status;
                message_node.textContent = message || "";
                if (status == "PASS") {
                    subtests_node.textContent = "1/1";
                } else {
                    subtests_node.textContent = "0/1";
                }
                this.result_count[status_node.className] += 1;
                var status_arr = ["PASS", "FAIL", "BLOCK"];
                for (var i = 0; i < status_arr.length; i++) {
                    this.elem.querySelector("td." + status_arr[i]).textContent = this.result_count[status_arr[i]];
                }
                have_old +=1;
            }
        }.bind(this));
        if (have_old==0){
          this.on_result_new(test, status, message, subtests);
        }
    },

    on_result_new: function(test, status, message, subtests) {
        var row = document.createElement("tr");
        row.classList.add(test.url);

        var subtest_pass_count = subtests.reduce(function(prev, current) {
            return (current.status === "PASS") ? prev + 1 : prev;
        }, 0);
        var subtests_count = subtests.length;

        var test_status;
        if (subtest_pass_count === subtests_count &&
            (status == "OK" || status == "PASS")) {
            if (status == 'OK' && subtests_count == 0) {
                test_status = 'BLOCK';
                this.result_count['BLOCK'] += 1;
            } else {
                test_status = "PASS";
            }
        } else if (subtests_count > 0 && status === "OK") {
            test_status = "FAIL";
        } else {
            test_status = status;
        }

        subtests.forEach(function(subtest) {
            if (this.result_count.hasOwnProperty(subtest.status)) {
                this.result_count[subtest.status] += 1;
            }
        }.bind(this));
        if (this.result_count.hasOwnProperty(status) && subtests_count == 0) {
            this.result_count[status] += 1;
        }

        var name_node = row.appendChild(document.createElement("td"));
        name_node.appendChild(this.test_name_node(test));

        var status_node = row.appendChild(document.createElement("td"));
        status_node.textContent = test_status;
        status_node.className = test_status;

        var message_node = row.appendChild(document.createElement("td"));
        message_node.textContent = message || "";

        var subtests_node = row.appendChild(document.createElement("td"));
        if (subtests_count) {
            subtests_node.textContent = subtest_pass_count + "/" + subtests_count;
        } else {
            if (test_status == "PASS") {
                subtests_node.textContent = "1/1";
            } else {
                subtests_node.textContent = "0/1";
            }
        }

        var status_arr = ["PASS", "FAIL", "BLOCK"];
        for (var i = 0; i < status_arr.length; i++) {
            this.elem.querySelector("td." + status_arr[i]).textContent = this.result_count[status_arr[i]];
        }

        this.results_table.tBodies[0].appendChild(row);
        this.update_meter(this.runner.progress(), this.runner.results.count(), this.runner.test_count());
    },

    on_done: function() {
        this.meter.setAttribute("aria-valuenow", this.meter.getAttribute("aria-valuemax"));
        this.meter.style.width = "100%";
        this.meter.textContent = "Done!";
        this.meter.classList.remove("progress-striped", "active");
        this.runner.test_div.textContent = "";
        //add the json serialization of the results
        var a = this.elem.querySelector(".jsonResults");
        var json = this.runner.results.to_json();

        if (document.getElementById("dumpit").checked) {
            this.json_re_area = document.createElement("textarea");
            this.json_re_area.style.width = "100%";
            this.json_re_area.setAttribute("rows", "50");
            this.elem.appendChild(this.json_re_area);
            this.json_re_area.textContent = json;
        }
        var blob = new Blob([json], { type: "application/json" });
        a.href = window.URL.createObjectURL(blob);
        a.download = "runner-results.json";
        a.textContent = "Download JSON results";
        if (!a.getAttribute("download")) a.textContent += " (right-click and save as to download)";
        a.style.display = "inline";
    },

    test_name_node: function(test) {
        if (!test.hasOwnProperty("ref_url")) {
            return this.link(test.url);
        } else {
            var wrapper = document.createElement("span");
            wrapper.appendChild(this.link(test.url));
            wrapper.appendChild(document.createTextNode(" " + test.ref_type + " "));
            wrapper.appendChild(this.link(test.ref_url));
            return wrapper;
        }
    },

    link: function(href) {
        var link = document.createElement("a");
        link.href = this.runner.server + href;
        link.textContent = href;
        return link;
    },

    update_meter: function(progress, count, total) {
        this.meter.setAttribute("aria-valuenow", count);
        this.meter.setAttribute("aria-valuemax", total);
        this.meter.textContent = this.meter.style.width = (progress * 100).toFixed(1) + "%";
    }

};

function ManualUI(elem, runner) {
    this.elem = elem;
    this.runner = runner;
    this.prev_button = this.elem.querySelector("button.prev");
    this.pass_button = this.elem.querySelector("button.pass");
    this.fail_button = this.elem.querySelector("button.fail");
    this.block_button = this.elem.querySelector("button.block");
    this.ref_buttons = this.elem.querySelector(".reftestUI");
    this.man_buttons = this.elem.querySelector(".mantestUI");
    this.ref_type = this.ref_buttons.querySelector(".refType");
    this.test_button = this.ref_buttons.querySelector("button.test");
    this.ref_button = this.ref_buttons.querySelector("button.ref");

    this.hide();

    this.runner.test_start_callbacks.push(this.on_test_start.bind(this));
    this.runner.test_pause_callbacks.push(this.hide.bind(this));
    this.runner.done_callbacks.push(this.on_done.bind(this));

    this.prev_button.onclick = function() {
        this.runner.prev_flag = true;
        this.runner.run_next_test();
        this.disable_buttons();
        setTimeout(this.enable_buttons.bind(this), 200);
    }.bind(this);

    this.pass_button.onclick = function() {
        this.runner.prev_flag = false;
        this.runner.on_result("PASS", "", []);
        this.disable_buttons();
        setTimeout(this.enable_buttons.bind(this), 200);
    }.bind(this);

    this.fail_button.onclick = function() {
        this.runner.prev_flag = false;
        this.runner.on_result("FAIL", "", []);
    }.bind(this);

    this.block_button.onclick = function() {
        this.runner.prev_flag = false;
        this.runner.on_result("BLOCK", "", []);
    }.bind(this);
}

ManualUI.prototype = {
    show: function() {
        this.elem.style.display = "block";
    },

    hide: function() {
        this.elem.style.display = "none";
    },

    show_ref: function() {
        this.ref_buttons.style.display = "block";
        this.man_buttons.style.display = "none";
        this.test_button.onclick = function() {
            this.runner.load(this.runner.current_test.url);
        }.bind(this);
        this.ref_button.onclick = function() {
            this.runner.load(this.runner.current_test.ref_url);
        }.bind(this);
    },

    hide_ref: function() {
        this.ref_buttons.style.display = "none";
        this.man_buttons.style.display = "block";
    },

    disable_buttons: function() {
        this.pass_button.disabled = true;
        this.fail_button.disabled = true;
    },

    enable_buttons: function() {
        this.pass_button.disabled = false;
        this.fail_button.disabled = false;
    },

    on_test_start: function(test) {
        if (test.type == "manual" || test.type == "reftest") {
            this.show();
        } else {
            this.hide();
        }
        if (test.type == "reftest") {
            this.show_ref();
            this.ref_type.textContent = test.ref_type === "==" ? "equal" : "unequal";
        } else {
            this.hide_ref();
        }
        var run_index = this.runner.manifest_iterator.test_index;
        if (run_index-1>0
            &&this.runner.manifest_iterator.filter_tests[run_index-2].type!="testharness"){
            this.prev_button.disabled = false;
        }else{
            this.prev_button.disabled = true;
        }
    },

    on_done: function() {
        this.hide();
    }
};

function SuiteUI(elem, runner){

    this.pelem = elem;
    this.elem = this.pelem.querySelector("div#selectpackages");
    this.runner = runner;
    this.select_all = this.elem.querySelector("input#selectall");
    this.ok_button = this.elem.querySelector("button.selcted-tests");
    this.packages_list = this.elem.querySelector("div.suitslist");
    this.filter_selected = this.pelem.querySelector("#select_tests");
    this.filter_input = this.pelem.querySelector("input#input_tests");
    this.render_suite_list(this.runner.select_json.data);
    this.select_category = this.elem.querySelectorAll("h4>label>input");
    this.all_input_box = this.packages_list.querySelectorAll("input");
    this.spec_list = Array.prototype.slice.call(this.packages_list.querySelectorAll("li>label>input"));
    this.category_list = Array.prototype.slice.call(this.packages_list.querySelectorAll("h4>label>input"));
    this.head_list = Array.prototype.slice.call(this.packages_list.querySelectorAll("h4>div"));
    this.set_lasted_blank();
    this.elem.style.top = "20%";
    this.hide();

    this.ok_button.onclick = function(){
        this.hide()
        this.filter_selected.name = this.set_fiter_array()
        this.set_status()
    }.bind(this);

    this.select_all.onclick = function(){
        this.refresh_select_list_all()
    }.bind(this);

    for (var i = 0, t = this.select_category.length; i < t; i++) {
        this.select_category[i].addEventListener('click', this.refresh_spec_list, false);
    }

    for(var i = 0,t = this.spec_list.length; i < t; i++){
        this.spec_list[i].addEventListener('click', this.refresh_categry_input, false);
    }

    for(var i = 0,t = this.all_input_box.length; i < t; i++){
        this.all_input_box[i].onclick = function(){
            this.refresh_selectall_input();
        }.bind(this);
    }
    for(var i = 0,t = this.head_list.length; i < t; i++){
        this.head_list[i].addEventListener('click', function(){
            var node = this.parentNode.parentNode.childNodes[1];
            var status = this.parentNode.parentNode.childNodes[1].style.display;
            if(status == 'block'){
                node.style.display = 'none';
            }else{
                node.style.display = 'block';
            }
        }, false);
    }

}
SuiteUI.prototype ={
    show: function() {
        this.elem.style.display = "block";
    },

    hide: function(callback) {
        this.elem.style.display = "none";
    },
    set_status: function(){
        var status = 0;
        Array.prototype.slice.call(this.all_input_box).forEach(function(dom){
            if(dom.checked) status +=1
        });
        if (status>0){
            this.filter_selected.classList.remove("btn-primary");
            this.filter_selected.classList.add("btn-warning");
            this.filter_input.value = '';
        }else{
            this.un_set_status();
        }
    },
    un_set_status:function(){
        this.filter_selected.classList.remove("btn-warning");
        this.filter_selected.classList.add("btn-primary");
        this.filter_selected.name = "";
        this.set_all_unslected();
    },
    render_suite_list: function(suite_data){
        var html = ''
        for(var k in suite_data){
            html +='<section style="border:none;"><h4 class="category" id="'+k+'">'
            html +='<label><input type="checkbox" id="'+k+'"> '+k+'</label><div style="height:20px;"></div></h4>'
            html +='<div style="display:block" id="'+k+'" >'
            var data_item = suite_data[k]
            for (var i in data_item){
                html += '<li class="specname"><label class="spec_list" for="'+i+'"><input type="checkbox" id="'+i+'"> '+data_item[i].spec_desc+'</label><a href="'+data_item[i].spec_url+'"> [Spec]</a></li>'
            }
            html +='</div ></section>'
        }
        this.packages_list.innerHTML = html
    },
    set_lasted_blank:function(){
        Array.prototype.slice.call(this.packages_list.querySelectorAll("h4>label")).forEach(function(dom){
            var leftWidth=dom.parentNode.offsetWidth-dom.offsetWidth;
            dom.parentNode.querySelector('div').style.width = leftWidth;
            dom.parentNode.querySelector('div').style.marginTop = '-21px';
            dom.parentNode.querySelector('div').style.marginLeft = dom.offsetWidth+'px';
        })
    },
    set_fiter_array:function(){
        var id_array = new Array();
        var node_list = new Array();
        node_list = Array.prototype.slice.call(this.packages_list.querySelectorAll("li>label>input:checked"));
        node_list.forEach(function (dom) {
            id_array.push(dom.getAttribute('id'))
        });
        return id_array.join(',')
    },

    refresh_select_list_all: function(){
        var status = this.select_all.checked
        this.spec_list.forEach(function (dom) {
            dom.checked = status;
        });
        this.category_list.forEach(function (dom) {
            dom.checked = status;
        });
    },

    refresh_spec_list: function(){
        var status = this.checked;
        var input_parent_node = this.parentNode.parentNode.parentNode.querySelector("div#"+this.id);
        var input_list = Array.prototype.slice.call(input_parent_node.querySelectorAll("li>label>input"));
        input_list.forEach(function(dom){
            dom.checked = status;
        })
    },
    refresh_selectall_input: function(){
        var status = true;
        Array.prototype.slice.call(this.all_input_box).forEach(function(dom){
            status = status && dom.checked;
        })
        this.select_all.checked = status;
    },
    refresh_categry_input: function(){
        var status = true;
        var spec_parent_id = this.parentNode.parentNode.parentNode.id;
        Array.prototype.slice.call(this.parentNode.parentNode.parentNode.querySelectorAll("li>label>input")).forEach(function(dom){
            status = status && dom.checked;
        })
        var spec_parent = this.parentNode.parentNode.parentNode.parentNode.querySelector("input#"+spec_parent_id)
        spec_parent.checked = status;
    },
    set_all_unslected: function(){
        Array.prototype.slice.call(this.all_input_box).forEach(function(dom){
            dom.checked = false;
        });
        this.select_all.checked = false;
    },
}
function TestControl(elem, runner) {
    this.elem = elem;
    this.filter_selected = this.elem.querySelector("#select_tests");
    this.filter_input = this.elem.querySelector("#input_tests");
    this.pause_button = this.elem.querySelector("button.togglePause");
    this.start_button = this.elem.querySelector("button.toggleStart");
    this.type_checkboxes = Array.prototype.slice.call(
    this.elem.querySelectorAll("input[type=checkbox].test-type"));
    this.iframe_checkbox = this.elem.querySelector(".iframe");
    this.timeout_input = this.elem.querySelector(".timeout_multiplier");
    this.render_checkbox = this.elem.querySelector(".render");
    this.runner = runner;
    this.runner.done_callbacks.push(this.on_done.bind(this));
    this.set_start();
    if(document.all){
        this.filter_input.onpropertychange = function(){
            if(this.filter_input.value.length>0){
               this.set_selection_status();
           }
        }.bind(this);
    }else{
        this.filter_input.onkeyup = function(){
            this.set_selection_status();
        }.bind(this);
    }
}

TestControl.prototype = {
    set_start: function() {
        this.start_button.disabled = false;
        this.pause_button.disabled = true;
        this.start_button.textContent = "Start";
        this.iframe_checkbox.disabled = false;
        this.timeout_input.disabled = false;
        this.filter_selected.disabled = false;
        this.filter_input.disabled = false;
        this.type_checkboxes.forEach(function(elem) {
            elem.disabled = false;
        });
        this.start_button.onclick = function() {
            var filter_array = this.get_filter();
            var test_types = this.get_test_types();
            var settings = this.get_testharness_settings();
            var run_mode = "window";
            if (this.iframe_checkbox.checked) {
                run_mode = "iframe";
            }
            this.runner.start(filter_array, test_types, settings, run_mode);
            if(this.runner.manifest_iterator.count()>0){
                this.iframe_checkbox.disabled = true;
                this.timeout_input.disabled = true;
                this.filter_selected.disabled = true;
                this.filter_input.disabled = true;
                this.set_stop();
                this.set_pause();
            }

        }.bind(this);
        this.filter_selected.onclick = function(){
            this.runner.suiteui.show();
        }.bind(this);

    },

    set_stop: function() {
        clearTimeout(this.runner.timeout);
        this.pause_button.disabled = false;
        this.start_button.textContent = "Stop";
        this.type_checkboxes.forEach(function(elem) {
            elem.disabled = true;
        });
        this.start_button.onclick = function() {
            this.iframe_checkbox.disabled = false;
            this.timeout_input.disabled = false;
            this.filter_selected.disabled = false;
            this.filter_input.disabled = false;
            this.runner.done();
        }.bind(this);
    },

    set_pause: function() {
        this.pause_button.textContent = "Pause";
        this.pause_button.onclick = function() {
            this.iframe_checkbox.disabled = true;
            this.timeout_input.disabled = true;
            this.filter_selected.disabled = true;
            this.filter_input.disabled = true;
            this.runner.pause();
            this.set_resume();
        }.bind(this);
    },

    set_resume: function() {
        this.pause_button.textContent = "Resume";
        this.pause_button.onclick = function() {
            this.runner.unpause();
            this.set_pause();
        }.bind(this);

    },

    get_filter: function(data) {
        var input_filter  = new Array();
        input_filter = this.filter_input.value.split(',');
        if (this.filter_input.value.length>0){
            return this.change_input_to_spec(input_filter)
        }else{
            var selected_filter  = new Array();
            selected_filter = this.filter_selected.name.split(',');
            return selected_filter;
        }
    },
    change_input_to_spec: function(input){
        var input_spec = new Array();
        for (var caty in this.runner.select_json.data){
            var category_data = this.runner.select_json.data[caty];
            for (var spec in category_data){
                for (var i in input){
                    var ipt  = input[i].toLowerCase();
                    if (spec.indexOf(ipt)>-1||category_data[spec].spec_desc.toLowerCase().indexOf(ipt)>-1){
                        if (input_spec.indexOf(spec) == -1) {
                            input_spec.push(spec);
                        }
                    }
                }
            }
        }
        return input_spec
    },
    set_selection_status: function(){
        this.runner.suiteui.un_set_status();
    },
    get_test_types: function() {
        return this.type_checkboxes.filter(function(elem) {
            return elem.checked;
        }).map(function(elem) {
            return elem.value;
        });
    },

    get_testharness_settings: function() {
        return {timeout_multiplier: parseFloat(this.timeout_input.value),
                output: this.render_checkbox.checked};
    },

    on_done: function() {
        this.set_pause();
        this.set_start();
    }
};

function Results(runner) {
    this.test_results = null;
    this.runner = runner;

    this.runner.start_callbacks.push(this.on_start.bind(this));
}

Results.prototype = {
    on_start: function() {
        this.test_results = [];
    },

    set: function(test, status, message, subtests) {

        if (this.runner.manifest_iterator.test_index <= this.test_results.length){
            var index = this.runner.manifest_iterator.test_index-1;
            if (this.test_results[index].test == test){
                this.test_results[index].subtests = subtests;
                this.test_results[index].status = status;
                this.test_results[index].message = message;
            }
        }else{
            this.test_results.push({"test":test,
                                "subtests":subtests,
                                "status":status,
                                "message":message});
        }
    },

    count: function() {
        return this.test_results.length;
    },

    to_json: function() {
        var data = {
            "results": this.test_results.map(function(result) {
                var rv = {"test":(result.test.hasOwnProperty("ref_url") ?
                                  [result.test.url, result.test.ref_type, result.test.ref_url] :
                                  result.test.url),
                          "subtests":result.subtests,
                          "status":result.status,
                          "message":result.message};
                return rv;
            })
        };
        return JSON.stringify(data, null, 2);
    }
};

function Runner(manifest_path) {
    this.server = location.protocol + "//" + location.host;
    this.manifest = new Manifest(manifest_path);
    this.select_json = new Manifest('/selection.json');
    this.filter_array = null;
    this.test_types = null;
    this.manifest_iterator = null;

    this.test_window = null;
    this.test_frame = document.getElementById('testFrame');
    this.test_div = document.getElementById('test_url');
    this.run_mode = null;
    this.current_test = null;
    this.timeout = null;
    this.num_tests = null;
    this.pause_flag = false;
    this.done_flag = false;
    this.prev_flag = false;

    this.start_callbacks = [];
    this.test_start_callbacks = [];
    this.test_pause_callbacks = [];
    this.result_callbacks = [];
    this.done_callbacks = [];

    this.results = new Results(this);

    this.start_after_manifest_load = false;
    this.manifest.load(this.manifest_loaded.bind(this));
    this.suiteui = null;
    this.select_json.load(this.selection_load.bind(this));
}

Runner.prototype = {
    test_timeout: 20000, //ms

    currentTest: function() {
        return this.manifest[this.mTestCount];
    },

    open_test_window: function() {
        this.test_window = window.open("about:blank", 800, 600);
        window.focus();
    },

    manifest_loaded: function() {
        if (this.start_after_manifest_load) {
            this.do_start();
        }
    },

    selection_load:function(){
        this.suiteui = new SuiteUI(document.getElementById("testControl"), this);
    },

    start: function(filter_array, test_types, testharness_settings, run_mode) {
        this.pause_flag = false;
        this.done_flag = false;
        this.filter_array = filter_array;
        this.test_types = test_types;
        window.testharness_properties = testharness_settings;
        this.run_mode = run_mode;

        this.manifest_iterator = new ManifestIterator(this.manifest, this.filter_array, this.test_types);
        this.num_tests = null;

        if (this.manifest.data === null) {
            this.start_after_manifest_load = true;
        } else {
            this.do_start();
        }
    },

    do_start: function() {
        if(this.manifest_iterator.count()>0){
            if (this.run_mode ==="window") {
                this.open_test_window();
            }else if (this.run_mode === "iframe") {
                this.test_frame.style.display = "block";
            }
            this.start_callbacks.forEach(function(callback) {
                callback();
            });
            this.run_next_test();
        }else{
            alert('No test spec found to run ...');
        }
    },

    pause: function() {
        this.pause_flag = true;
        this.test_pause_callbacks.forEach(function(callback) {
            callback(this.current_test);
        }.bind(this));
    },

    unpause: function() {
        this.pause_flag = false;
        this.manifest_iterator.test_index -= 1;
        this.run_next_test();
    },

    on_result: function(status, message, subtests) {
        clearTimeout(this.timeout);
        this.results.set(this.current_test, status, message, subtests);
        this.result_callbacks.forEach(function(callback) {
            callback(this.current_test, status, message, subtests);
        }.bind(this));
        this.run_next_test();
    },

    on_timeout: function() {
        this.on_result("BLOCK", "", []);
    },

    done: function() {
        this.done_flag = true;
        if (this.run_mode === "window") {
            if (this.test_window) {
                this.test_window.close();
            }
        } else {
            this.test_frame.src = "";
            this.test_frame.style.display = "none";
        }

        this.done_callbacks.forEach(function(callback) {
            callback();
        });
    },

    run_next_test: function() {
        if (this.pause_flag) {
            return;
        }
        if (this.prev_flag){
            var next_test = this.manifest_iterator.prev();
        }else{
            var next_test = this.manifest_iterator.next();
        }

        if (next_test === null||this.done_flag) {
            this.done();
            return;
        }

        this.current_test = next_test;

        if (next_test.type === "testharness") {
            this.timeout = setTimeout(this.on_timeout.bind(this),
                                      this.test_timeout * window.testharness_properties.timeout_multiplier);
            this.prev_flag = false;
        }
        this.test_div.textContent = this.current_test.url;
        this.load(this.current_test.url);

        this.test_start_callbacks.forEach(function(callback) {
            callback(this.current_test);
        }.bind(this));
    },

    load: function(path) {
        if (this.run_mode === "window") {
            if (this.test_window.location === null) {
                this.open_test_window();
            }
            this.test_window.location.href = this.server + path;
        } else {
            this.test_frame.src = this.server + path;
        } 
    },

    progress: function() {
        return this.results.count() / this.test_count();
    },

    test_count: function() {
        if (this.num_tests === null) {
            this.num_tests = this.manifest_iterator.count();
        }
        return this.num_tests;
    }

};


function parseOptions() {
    var options = {
        test_types: ["testharness", "reftest", "manual"]
    };

    var optionstrings = location.search.substring(1).split("&");
    for (var i = 0, il = optionstrings.length; i < il; ++i) {
        var opt = optionstrings[i];
        //TODO: fix this for complex-valued options
        options[opt.substring(0, opt.indexOf("="))] =
            opt.substring(opt.indexOf("=") + 1);
    }
    return options;
}

function loadconfig(path,dom) {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== 4) {
                return;
            }
            if (!(xhr.status === 200 || xhr.status === 0)) {
                throw new Error("config file " + path + " failed to load");
            }
            var config_data = JSON.parse(xhr.responseText);
            dom.innerHTML = config_data.tests_version;
        };
        xhr.open("GET", path);
        xhr.send(null);
}

function setup() {
    var options = parseOptions();

    if (options.path) {
        document.getElementById('input_tests').value = options.path;
    }
    var help_btn = document.getElementById("show_info");
    var run_info = document.getElementById("help");
    var version_dom = document.getElementById('version');
    run_info.style.display = "none";
    help_btn.addEventListener('click',function(){
        if(run_info.style.display == "none"){
            run_info.style.display = "block";
        }else{
            run_info.style.display = "none";
        }
    } , false);
    loadconfig("/config.json",version_dom);
    runner = new Runner("/MANIFEST.json", options);
    var test_control = new TestControl(document.getElementById("testControl"), runner);
    new ManualUI(document.getElementById("manualUI"), runner);
    new VisualOutput(document.getElementById("output"), runner);

    if (options.autorun === "1") {

        runner.start(test_control.get_filter(),
                    test_control.get_test_types(),
                    test_control.get_testharness_settings());
        return;
    }
}

window.completion_callback = function(tests, status) {
    var harness_status_map = {0:"OK", 1:"FAIL", 2:"BLOCK"};
    var subtest_status_map = {0:"PASS", 1:"FAIL", 2:"BLOCK", 3:"BLOCK"};

    // this ugly hack is because IE really insists on holding on to the objects it creates in
    // other windows, and on losing track of them when the window gets closed
    var subtest_results = JSON.parse(JSON.stringify(
        tests.map(function (test) {
            return {name: test.name,
                    status: subtest_status_map[test.status],
                    message: test.message};
        })
    ));

    runner.on_result(harness_status_map[status.status],
                     status.message,
                     subtest_results);
};

window.addEventListener("DOMContentLoaded", setup, false);
})();
