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
            document.getElementById("over").style.display = "none";
            document.getElementById("layout").style.display = "none";
            document.getElementById("container").style.display = "block";
            var popup_text = navigator.userAgent;
            if (popup_text.indexOf("Android") != -1 && popup_text.indexOf("Crosswalk") == -1){
                var cookie_item = get_popup_cookie("wts_client");
                if (cookie_item == ""){
                    set_popup_cookie("wts_client", "yes", 30);
                    document.getElementById("popup").style.display = "block";
                    document.getElementById("test_select_div").classList.add("margin_top_50");
                }
            }
            this.data = JSON.parse(xhr.responseText);
            loaded_callback();
        }.bind(this);
        xhr.open("GET", this.path);
        xhr.send(null);
    },
    
    manifest_load: function(loaded_callback) {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== 4) {
                return;
            }
            if (!(xhr.status === 200 || xhr.status === 0)) {
                throw new Error("Manifest " + this.path + " failed to load");
            }
            document.getElementById("loading_div").style.display = "none";
            document.getElementById("start_btn").disabled = false;
            document.getElementById("start_btn").classList.remove("start_disabled");
            document.getElementById("start_btn").classList.add("start");
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

function ManifestIterator(manifest, filter_array, test_types, select_json) {
    this.manifest = manifest;
    this.filter_array = filter_array
    this.test_types = test_types;
    this.test_index = 0;
    this.select_json_data = new Array();
    this.select_json(select_json);
    this.filter_tests = new Array();
    this.filter_cases();
}
var type_arr = new Array();
type_arr["testharness"] = "auto";
type_arr["reftest"] = "reference";
type_arr["manual"] = "manual";

ManifestIterator.prototype = {
    select_json: function(select_json){
        var suite_data = select_json.data;
        for(var k in suite_data){
            var data_item = suite_data[k];                
            for (var i in data_item){
                this.select_json_data[i] = data_item[i].spec_desc;
            }
        }
    },

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
        var suite_name = manifest_item.url.split("/")[2];
        var test = {
            type: test_type,
            url: manifest_item.url,
            spec_desc: this.select_json_data[suite_name]
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
    this.top_scroll_div = this.elem.querySelector(".top_scroll > div");
    this.results_table = this.elem.querySelector(".results > div > table");
    this.section = null;
    this.progress = this.elem.querySelector(".summary .progress");
    this.meter = this.progress.querySelector(".progress-bar");
    this.result_count = null;

    this.elem.style.display = "none";
    this.runner.start_callbacks.push(this.on_start.bind(this));
    this.runner.result_callbacks.push(this.on_result.bind(this));
    this.runner.done_callbacks.push(this.on_done.bind(this));
    this.sync_scroll();
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
        this.top_scroll_div.style.width = this.results_table.scrollWidth + 'px';
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
            var textarea_dlt = Array.prototype.slice.call(this.elem.querySelectorAll("textarea"));
            for(var i = 0,t = textarea_dlt.length; i < t; i++){
                this.elem.removeChild(textarea_dlt[i]);
            }
            this.json_re_area = document.createElement("textarea");
            this.json_re_area.style.width = "100%";
            this.json_re_area.setAttribute("rows", "50");
            this.elem.appendChild(this.json_re_area);
            this.json_re_area.textContent = json;
        }
        var blob = new Blob([json], { type: "application/json" });
        a.href = window.URL.createObjectURL(blob);
        a.download = "runner-results.json";
        a.textContent = "Download JSON Results";
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
    },

    sync_scroll: function() {
        var scrollbar = document.getElementById("top_scroll");
        var element = document.getElementById("detail");
        scrollbar.onscroll= function() {
            element.scrollLeft= scrollbar.scrollLeft;
        };
        element.onscroll= function() {
            scrollbar.scrollLeft= element.scrollLeft;
        };
    }

};

function ManualUI(elem, runner) {
    this.elem = elem;
    this.runner = runner;
    this.prev_button = this.elem.querySelector("button.prev");
    this.fwd_button = this.elem.querySelector("button.fwd");
    this.pass_button = this.elem.querySelector("button.pass");
    this.fail_button = this.elem.querySelector("button.fail");
    this.block_button = this.elem.querySelector("button.block");
    this.ref_buttons_div = this.elem.querySelector("div.reftestUI");
    this.test_button = this.ref_buttons_div.querySelector("button#btn_test");
    this.ref_button = this.ref_buttons_div.querySelector("button.ref");
    this.result_button_div = this.elem.querySelector("div.result_button");

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

    this.fwd_button.onclick = function() {
        this.runner.prev_flag = false;
        this.runner.run_next_test();
        this.disable_buttons();
        setTimeout(this.enable_buttons.bind(this), 200);
    }.bind(this);

    this.pass_button.onclick = function() {
        this.runner.prev_flag = false;
        this.runner.on_result("PASS", "", "unjs");
        this.disable_buttons();
        setTimeout(this.enable_buttons.bind(this), 200);
    }.bind(this);

    this.fail_button.onclick = function() {
        this.runner.prev_flag = false;
        this.runner.on_result("FAIL", "", "unjs");
    }.bind(this);

    this.block_button.onclick = function() {
        this.runner.prev_flag = false;
        this.runner.on_result("BLOCK", "", "unjs");
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
        this.ref_buttons_div.style.display = "block";
        this.result_button_div.classList.remove("width_100");
        this.result_button_div.classList.add("width_49_75");
        this.result_button_div.classList.add("margin_left_0_5");
        this.test_button.onclick = function() {
            this.runner.load(this.runner.current_test.url);
        }.bind(this);
        this.ref_button.onclick = function() {
            this.runner.load(this.runner.current_test.ref_url);
        }.bind(this);
    },

    hide_ref: function() {
        this.ref_buttons_div.style.display = "none";
        this.result_button_div.classList.remove("width_49_75");
        this.result_button_div.classList.remove("margin_left_0_5");
        this.result_button_div.classList.add("width_100");
    },

    disable_buttons: function() {
        this.pass_button.disabled = true;
        this.fail_button.disabled = true;
        this.block_button.disabled = true;
    },

    enable_buttons: function() {
        this.pass_button.disabled = false;
        this.fail_button.disabled = false;
        this.block_button.disabled = false;
    },

    on_test_start: function(test) {
        document.getElementById("test_select_div").style.display = "none";
        if (test.type == "manual" || test.type == "reftest") {
            document.getElementById("start_btn_div").classList.add("start_btn_div_manual");
            this.show();
        } else {
            this.hide();
        }
        if (test.type == "reftest") {
            document.getElementById("start_btn_div").classList.remove("start_btn_div_manual");
            document.getElementById("start_btn_div").classList.add("start_btn_div_reftest");
            this.show_ref();
            this.ref_button.textContent = test.ref_type === "==" ? "Show Reference" : "Show Reference(mismatch)";
            if (this.ref_button.textContent == "Show Reference") {
                this.test_button.classList.remove("test_mismatch");
                this.test_button.classList.add("test");
            } else {
                this.test_button.classList.remove("test");
                this.test_button.classList.add("test_mismatch");
            }
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
        if (run_index >= this.runner.manifest_iterator.filter_tests.length){
            this.fwd_button.disabled = true;
        }else{
            this.fwd_button.disabled = false;
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
    this.select_all_label = this.elem.querySelector("label#select_all_label");
    this.select_all_span = this.elem.querySelector("span#select_all_span");
    this.ok_button = this.elem.querySelector("button.selcted-tests");
    this.packages_list = this.elem.querySelector("div.suitslist");
    this.filter_selected = this.pelem.querySelector("#select_tests");
    this.filter_input = this.pelem.querySelector("input#input_tests");
    this.render_suite_list(this.runner.select_json.data);
    this.spec_list = Array.prototype.slice.call(this.packages_list.querySelectorAll("li>label>input"));
    this.spec_list_li = Array.prototype.slice.call(this.packages_list.querySelectorAll("li.specname"));
    this.head_list = Array.prototype.slice.call(this.packages_list.querySelectorAll(".accordion-heading"));
    this.categry_num = Array.prototype.slice.call(this.packages_list.querySelectorAll("div.categry_num"));

    this.select_all.onclick = function(){
        this.refresh_select_list_all()
    }.bind(this);
    
    for(var i = 0,t = this.spec_list_li.length; i < t; i++){
        this.spec_list_li[i].addEventListener('click', this.refresh_categry_input_and_test_number_by_li, false);
    }

    for(var i = 0,t = this.head_list.length; i < t; i++){
        this.head_list[i].addEventListener('click', this.show_hide_spec_list, false);
    }

    for(var i = 0,t = this.categry_num.length; i < t; i++){
        this.categry_num[i].addEventListener('click', this.refresh_categry_select, false);
    }
}
SuiteUI.prototype ={
    render_suite_list: function(suite_data){
        var html = ''
        var total_num = 0;
        var index_num = 0;
        for(var k in suite_data){
            var categry_num = 0;
            var tab_html = '';
            tab_html +='<div class="accordion-body collapse display_none"><div class="accordion-inner" id="index_'+index_num+'">';
            var data_item = suite_data[k];                
            for (var i in data_item){
                tab_html += '<li class="specname"><label class="spec_list" ><input type="checkbox" id="'+i+'"> '+data_item[i].spec_desc+'</label><a href="'+data_item[i].spec_url+'" target="_blank"> <span class="glyphicon glyphicon-home"></span></a></li>'
                total_num++;
                categry_num++;
            }
            tab_html +='</div ></div ></div >';
            tab_html = '<div class="accordion-group"><div class="accordion-heading"><label class="category_label"> '+k+'</label><div class="categry_num ctg_num_uncheck">0/'+categry_num+'</div></div>' + tab_html;
            html += tab_html;
            index_num++;
        }
        this.packages_list.innerHTML = html;
        this.select_all_label.childNodes[3].innerHTML = "0/"+total_num;
    },
    
    refresh_select_list_all: function(){
        var status = this.select_all.checked;
        var select_all_str = this.select_all_label.childNodes[3].innerHTML;
        var arr1 = select_all_str.split("/");
        if(status == true){
            this.select_all_label.classList.remove("unselect_all_label");
            this.select_all_label.classList.add("select_all_label");
            this.select_all_span.classList.remove("glyphicon-star-empty");
            this.select_all_span.classList.add("glyphicon-star");
            this.spec_list.forEach(function (dom) {
                dom.parentNode.classList.add("spec_list_check");
            });
            this.select_all_label.childNodes[3].innerHTML = arr1[1] + "/" + arr1[1];
            this.head_list.forEach(function (dom) {
                var category_str = dom.childNodes[1].innerHTML;
                var arr1 = category_str.split("/");
                dom.childNodes[1].innerHTML = arr1[1] + "/" + arr1[1];
                dom.childNodes[1].classList.remove("ctg_num_uncheck");
                dom.childNodes[1].classList.add("ctg_num_check");
            });
        }else{
            this.select_all_label.classList.remove("select_all_label");
            this.select_all_label.classList.add("unselect_all_label");
            this.select_all_span.classList.remove("glyphicon-star");
            this.select_all_span.classList.add("glyphicon-star-empty");
            this.spec_list.forEach(function (dom) {
                dom.parentNode.classList.remove("spec_list_check");
            });
            this.select_all_label.childNodes[3].innerHTML = "0/" + arr1[1];
            this.head_list.forEach(function (dom) {
                var category_str = dom.childNodes[1].innerHTML;
                var arr1 = category_str.split("/");
                dom.childNodes[1].innerHTML = "0/" + arr1[1];
                dom.childNodes[1].classList.remove("ctg_num_check");
                dom.childNodes[1].classList.add("ctg_num_uncheck");
            });
        }
        this.spec_list.forEach(function (dom) {
            dom.checked = status;
        });
    },
    
    refresh_categry_input_and_test_number_by_li: function(e){
        var ev = e || window.event;
        var elm = ev.target || ev.srcElement;
        if (elm.tagName == 'SPAN' || elm.tagName == 'LABEL') {return;}
        var node_input = this.childNodes[0].childNodes[0];
        if (elm.tagName == 'LI'){
            if(node_input.checked == true){
                node_input.checked = false;
            }else{
                node_input.checked = true;
            }
        }
        
        var node_num_div = this.parentNode.parentNode.parentNode.childNodes[0].childNodes[1];
        var category_str = node_num_div.innerHTML;
        var arr1 = category_str.split("/");
        
        var node_select_all_label = document.getElementById("select_all_label");
        var select_all_str = node_select_all_label.childNodes[3].innerHTML;
        var all_arr1 = select_all_str.split("/");
        
        var check_num = 0;
        var all_check_num = 0;
        
        var this_status = node_input.checked;
        if(this_status == true){
            this.childNodes[0].classList.add("spec_list_check");
            check_num = parseInt(arr1[0]) + 1;
            node_num_div.innerHTML = check_num + "/" + arr1[1];
            all_check_num = parseInt(all_arr1[0]) + 1;
            node_select_all_label.childNodes[3].innerHTML = all_check_num + "/" + all_arr1[1];
        }else{
            check_num = parseInt(arr1[0]) - 1;
            this.childNodes[0].classList.remove("spec_list_check");
            node_num_div.innerHTML = check_num + "/" + arr1[1];
            all_check_num = parseInt(all_arr1[0]) - 1;
            node_select_all_label.childNodes[3].innerHTML = all_check_num + "/" + all_arr1[1];
        }
        
        if (all_check_num == all_arr1[1]){
            node_select_all_label.classList.remove("unselect_all_label");
            node_select_all_label.classList.add("select_all_label");
            node_select_all_label.parentNode.childNodes[1].checked = true;
        }else{
            node_select_all_label.classList.remove("select_all_label");
            node_select_all_label.classList.add("unselect_all_label");
            node_select_all_label.parentNode.childNodes[1].checked = false;
        }
        
        if(check_num == 0){
            node_num_div.classList.remove("ctg_num_check");
            node_num_div.classList.add("ctg_num_uncheck");
        }else{
            node_num_div.classList.remove("ctg_num_uncheck");
            node_num_div.classList.add("ctg_num_check");
        }
    },
    
    show_hide_spec_list: function(){
        var node = this.parentNode.childNodes[1];
        var status = node.style.display;
        var category_group_list = Array.prototype.slice.call(this.parentNode.parentNode.childNodes);
        for(var j = 0,k = category_group_list.length; j < k; j++){
            category_group_list[j].childNodes[1].style.display = "none";
        }
        if(status == 'block'){
            node.style.display = 'none';
        }else{
            node.style.display = 'block';
        }
    },
    
    refresh_categry_select: function(){
        var category_str = this.innerHTML;
        var arr1 = category_str.split("/");
        var arr_li = Array.prototype.slice.call(this.parentNode.parentNode.querySelectorAll("li.specname"));
        
        var node_select_all_label = document.getElementById("select_all_label");
        var select_all_str = node_select_all_label.childNodes[3].innerHTML;
        var all_arr1 = select_all_str.split("/");
        
        var all_check_num = 0;
        if (arr1[0] != arr1[1]){
            this.innerHTML = arr1[1] + "/" + arr1[1];
            this.classList.remove("ctg_num_uncheck");
            this.classList.add("ctg_num_check");
            arr_li.forEach(function(dom){
                dom.childNodes[0].childNodes[0].checked = true;
                dom.childNodes[0].classList.add("spec_list_check");
            });
            all_check_num = parseInt(all_arr1[0]) + parseInt(arr1[1]) - parseInt(arr1[0]);
            node_select_all_label.childNodes[3].innerHTML = all_check_num + "/" + all_arr1[1];
        }else{
            this.innerHTML = "0/" + arr1[1];
            this.classList.remove("ctg_num_check");
            this.classList.add("ctg_num_uncheck");
            arr_li.forEach(function(dom){
                dom.childNodes[0].childNodes[0].checked = false;
                dom.childNodes[0].classList.remove("spec_list_check");
            });
            all_check_num = parseInt(all_arr1[0]) - parseInt(arr1[1]);
            node_select_all_label.childNodes[3].innerHTML = all_check_num + "/" + all_arr1[1];
        }
        if(this.parentNode.parentNode.childNodes[1].style.display == "block"){
            this.parentNode.parentNode.childNodes[1].style.display = "none";
        }
        
        if (all_check_num == all_arr1[1]){
            node_select_all_label.classList.remove("unselect_all_label");
            node_select_all_label.classList.add("select_all_label");
            node_select_all_label.parentNode.childNodes[1].checked = true;
        }else{
            node_select_all_label.classList.remove("select_all_label");
            node_select_all_label.classList.add("unselect_all_label");
            node_select_all_label.parentNode.childNodes[1].checked = false;
        }
    },
}
function TestControl(elem, runner) {
    this.elem = elem;
    this.filter_selected = this.elem.querySelector("#select_tests");
    this.filter_input = this.elem.querySelector("#input_tests");
    this.pause_button = this.elem.querySelector("#togglePause");
    this.start_button = this.elem.querySelector("#start_btn");
    this.start_li = this.elem.querySelector("#toggleStart");
    this.type_checkboxes = Array.prototype.slice.call(
    this.elem.querySelectorAll("input[type=checkbox].test-type"));
    this.iframe_checkbox = this.elem.querySelector(".iframe");
    this.timeout_input = this.elem.querySelector(".timeout_multiplier");
    this.runner = runner;
    this.runner.done_callbacks.push(this.on_done.bind(this));
    this.select_tab = this.elem.querySelector("#li_select_test_specs");
    this.input_tab = this.elem.querySelector("#li_input_test_specs");
    this.select_div = this.elem.querySelector("#select_test_specs");
    this.input_div = this.elem.querySelector("#input_test_specs");
    this.test_type_li_list = Array.prototype.slice.call(this.elem.querySelectorAll("li.test_type_li"));
    this.input_test_pp = this.elem.querySelector("div.input_test_pp");
    this.input_test_result = this.elem.querySelector("div.input_test_result");
    this.input_result_remove = '';
    this.add_li = this.elem.querySelector("li.add_li");
    this.iframe_li = this.elem.querySelector("#iframe_ckb");
    this.dumpit_li = this.elem.querySelector("#dumpit_ckb");
    this.advanced_link = this.elem.querySelector(".advanced_link");
    this.advanced_div = this.elem.querySelector(".advanced_div");
    this.start_error = this.elem.querySelector(".start_error");
    this.cancel_link = this.elem.querySelector("span.cancel_popup");
    this.spec_link = this.elem.querySelector("span.link_popup");
    this.popup_div = this.elem.querySelector("div.popup");
    this.test_select_div = this.elem.querySelector("div#test_select_div");

    this.set_start();  

    this.cancel_link.onclick = function(){
        this.popup_div.style.display = "none";
        this.test_select_div.classList.remove("margin_top_50");
    }.bind(this);
    
    this.spec_link.onclick = function(){
        window.location.href = "https://github.com/crosswalk-project/web-testing-service/wiki#download";
    }.bind(this);

    this.select_tab.onclick = function(){
        this.select_select_tab();
    }.bind(this);

    this.input_tab.onclick = function(){
        this.select_input_tab();
    }.bind(this);
    
    this.dumpit_li.onclick = function(){
        this.change_dumpit_li(this.dumpit_li);
    }.bind(this);

    this.iframe_li.onclick = function(){
        this.change_iframe_li(this.iframe_li);
    }.bind(this);

    this.add_li.onclick = function(){
        this.add_input_result(this.runner.select_json.data);
    }.bind(this);
    
    this.advanced_link.onclick = function(){
        if(this.advanced_div.style.display == "block"){
            this.advanced_div.style.display = "none";
            this.advanced_link.querySelector("span").classList.remove("glyphicon-chevron-down");
            this.advanced_link.querySelector("span").classList.add("glyphicon-chevron-up");
        }else{
            this.advanced_div.style.display = "block";
            this.advanced_link.querySelector("span").classList.remove("glyphicon-chevron-up");
            this.advanced_link.querySelector("span").classList.add("glyphicon-chevron-down");
        }
    }.bind(this);

    for (var i = 0, t = this.test_type_li_list.length; i < t; i++) {
        if(i == 0){
            this.test_type_li_list[i].querySelector("input").checked = true;
        }else{
            this.test_type_li_list[i].querySelector("input").checked = false;
        }
        this.test_type_li_list[i].addEventListener('click', this.change_ckb_by_li, false);
    }

    if(document.all){
        this.filter_input.onpropertychange = function(){
            if(this.filter_input.value.length>0){
               this.set_selection_status(this.runner.select_json.data);
           }
        }.bind(this);
    }else{
        this.filter_input.onkeyup = function(){
            this.set_selection_status(this.runner.select_json.data);
        }.bind(this);
    }


}

TestControl.prototype = {
    set_start: function() {
        if(this.start_button.textContent != "Stop"){
            this.start_button.textContent = "Run";
        }else{
            this.start_button.textContent = "Rerun";
        }
        this.iframe_checkbox.disabled = false;
        this.timeout_input.disabled = false;
        this.filter_selected.disabled = false;
        this.filter_input.disabled = false;
        this.input_test_pp.classList.remove("input_test_pp_border");
        this.input_test_pp.classList.add("input_test_pp_no_border");
        
        this.start_error.style.display = "none";
        this.type_checkboxes.forEach(function(elem) {
            elem.disabled = false;
        });
        this.start_button.onclick = function() {
            var filter_array = this.get_filter();
            var test_types = this.get_test_types();
            var settings = this.get_testharness_settings();
            this.start_li.classList.remove("width_100");
            this.start_li.classList.add("width_49_75");
            this.pause_button.classList.remove("button_hidden");
            this.popup_div.style.display = "none";
            this.test_select_div.classList.remove("margin_top_50");
            window.scrollTo(0,0);
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
        document.getElementById("help").style.display = "none";
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
    
    set_back: function() {
        this.pause_button.textContent = "Back";
        this.pause_button.onclick = function() {
            document.getElementById("help").style.display = "block";
            document.getElementById("test_select_div").style.display = "block";
            document.getElementById("start_btn_div").classList.remove("start_btn_div_manual");
            document.getElementById("start_btn_div").classList.remove("start_btn_div_reftest");
            document.getElementById("output").style.display = "none";
            this.pause_button.classList.add("button_hidden");
            this.start_li.classList.remove("width_49_75");
            this.start_li.classList.add("width_100");
            this.start_button.textContent = "Run";
        }.bind(this);
    },

    get_filter: function(data) {
        if (this.input_tab.classList.length>1){
            if (this.input_test_result.querySelector("ul").childNodes.length>0){
                var input_filter  = new Array();
                var li_list = Array.prototype.slice.call(this.input_test_result.querySelectorAll("li"));
                li_list.forEach(function (dom) {
                    input_filter.push(dom.childNodes[0].data);
                });
                return this.change_input_to_spec(input_filter)
            }else{
                return new Array();
            }
        }else{
            var selected_filter  = new Array();
            selected_filter = this.set_fiter_array();
            return selected_filter;
        }
    },
    
    set_fiter_array:function(){
        var id_array = new Array();
        var node_list = new Array();
        node_list = Array.prototype.slice.call(this.select_div.querySelectorAll("li>label>input:checked"));
        node_list.forEach(function (dom) {
            id_array.push(dom.getAttribute('id'))
        });
        return id_array
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
    set_selection_status: function(suite_data){
        var input_value = this.filter_input.value.toLocaleLowerCase();
        if(this.filter_input.value.length>2){
            this.input_test_pp.style.display = "block";
            this.input_test_pp.classList.remove("input_test_pp_no_border");
            this.input_test_pp.classList.add("input_test_pp_border");
            var arr_html = new Array();
            for(var k in suite_data){
                if(k.toLocaleLowerCase().indexOf(input_value) == 0){
                    arr_html.push('<span class="input_value_span">'+k+'*</span>');
                }
                var data_item = suite_data[k];
                for (var i in data_item){
                    if(i.toLocaleLowerCase().indexOf(input_value) == 0){
                        arr_html.push('<span class="input_value_span">'+data_item[i].spec_desc+'</span>');
                        continue;
                    }
                    if(data_item[i].spec_desc.toLocaleLowerCase().indexOf(input_value) == 0){
                        arr_html.push('<span class="input_value_span">'+data_item[i].spec_desc+'</span>');
                    }
                }
            }
            this.input_test_pp.innerHTML = arr_html.join("<br>");
            var input_span = Array.prototype.slice.call(this.elem.querySelectorAll("span.input_value_span"));
            for (var i = 0, t = input_span.length; i < t; i++) {
                input_span[i].addEventListener('click', function(){
                    document.getElementById("input_tests").value = this.innerHTML;
                }, false);
            }
        }else{
            this.input_test_pp.classList.remove("input_test_pp_border");
            this.input_test_pp.classList.add("input_test_pp_no_border");
            this.input_test_pp.innerHTML = "";
        }
    },

    get_test_types: function() {
        var test_type = new Array();
        for (var i = 0, t = this.test_type_li_list.length; i < t; i++) {
            if(this.test_type_li_list[i].querySelector("input").checked == true){
                test_type.push(this.test_type_li_list[i].querySelector("input").value);
            }
        }
        return test_type;
    },

    get_testharness_settings: function() {
        return {timeout_multiplier: parseFloat(this.timeout_input.value),
                output: false};
    },

    on_done: function() {
        this.set_start();
        this.set_back();
    },
    
    select_select_tab: function(){
        this.select_tab.classList.remove("my_active");
        this.select_tab.classList.add("my_active");
        this.select_div.classList.remove("my_active");
        this.select_div.classList.add("my_active");
        this.input_tab.classList.remove("my_active");
        this.input_div.classList.remove("my_active");
    },
    
    select_input_tab: function(){
        this.select_tab.classList.remove("my_active");
        this.select_div.classList.remove("my_active");
        this.input_tab.classList.remove("my_active");
        this.input_tab.classList.add("my_active");
        this.input_div.classList.remove("my_active");
        this.input_div.classList.add("my_active");
    },
    
    change_ckb_by_li: function(){
        if(this.querySelector("input").checked == true){
            this.querySelector("input").checked = false;
            this.querySelector("span").classList.remove("glyphicon-star");
            this.querySelector("span").classList.add("glyphicon-star-empty");
            this.classList.remove("test_type_check");
            this.classList.add("test_type_uncheck");
        }else{
            this.querySelector("input").checked = true;
            this.querySelector("span").classList.remove("glyphicon-star-empty");
            this.querySelector("span").classList.add("glyphicon-star");
            this.classList.remove("test_type_uncheck");
            this.classList.add("test_type_check");
        }
    },
    
    change_dumpit_li: function(dom){
        if(dom.querySelector("input").checked == true){
            dom.querySelector("input").checked = false;
            dom.querySelector("span").classList.add("glyphicon-star-empty");
            dom.querySelector("span").classList.remove("glyphicon-star");
            dom.classList.remove("advanced_ckb_checked");
            dom.classList.add("advanced_ckb_unchecked");
        }else{
            dom.querySelector("input").checked = true;
            dom.querySelector("span").classList.add("glyphicon-star");
            dom.querySelector("span").classList.remove("glyphicon-star-empty");
            dom.classList.remove("advanced_ckb_unchecked");
            dom.classList.add("advanced_ckb_checked");
        }
    },
    
    change_iframe_li: function(dom){
        if(dom.querySelector("input").checked == true){
            dom.querySelector("input").checked = false;
            dom.querySelector("span").classList.add("glyphicon-star-empty");
            dom.querySelector("span").classList.remove("glyphicon-star");
            dom.classList.remove("advanced_ckb_checked");
            dom.classList.add("advanced_ckb_unchecked");
        }else{
            dom.querySelector("input").checked = true;
            dom.querySelector("span").classList.add("glyphicon-star");
            dom.querySelector("span").classList.remove("glyphicon-star-empty");
            dom.classList.remove("advanced_ckb_unchecked");
            dom.classList.add("advanced_ckb_checked");
        }
    },
    
    add_input_result: function(suite_data){
        var input_value = this.filter_input.value.toLocaleLowerCase();
        var item = input_value.split('*');
        input_value = item[0];
        var list_arr = new Array();
		var list_arr_lower = new Array();
        var li_list = Array.prototype.slice.call(this.input_test_result.querySelectorAll("li"));
        li_list.forEach(function (dom) {
            list_arr.push(dom.childNodes[0].data);
			list_arr_lower.push(dom.childNodes[0].data.toLocaleLowerCase());
        });
        var tmp = 1;
        for(var k in suite_data){
            if(k.toLocaleLowerCase() == input_value){
                var data_item = suite_data[k];
                for (var i in data_item){
                    if(list_arr_lower.indexOf(data_item[i].spec_desc.toLocaleLowerCase()) == -1){
                        list_arr.push(data_item[i].spec_desc);
                        tmp = 2;
                    }                        
                }
            }else{
                var data_item = suite_data[k];
                for (var i in data_item){
                    if(i.toLocaleLowerCase() == input_value){
                        if(list_arr_lower.indexOf(data_item[i].spec_desc.toLocaleLowerCase()) == -1){
                            list_arr.push(data_item[i].spec_desc);
                            tmp = 2;
                        }
                    }else if(data_item[i].spec_desc.toLocaleLowerCase() == input_value){
                        if(list_arr_lower.indexOf(data_item[i].spec_desc.toLocaleLowerCase()) == -1){
                            list_arr.push(data_item[i].spec_desc);
                            tmp = 2;
                        }
                    }
                }
            }
        }
        if(tmp == 2){
            var ul_html = ''; 
            list_arr.forEach(function (dom) {
                ul_html += '<li>'+dom+'<span class="glyphicon glyphicon-remove"></span></li>';
            });
            this.input_test_result.querySelector("ul").innerHTML = ul_html;
            
            this.input_result_remove = Array.prototype.slice.call(this.input_test_result.querySelectorAll("li>span"));
            for (var i = 0, t = this.input_result_remove.length; i < t; i++) {
                this.input_result_remove[i].addEventListener('click', this.remove_input_result, false);
            }
        }
    },
    
    remove_input_result: function(){
        this.parentNode.parentNode.removeChild(this.parentNode);
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
                          "type": type_arr[result.test.type],
                          "spec_desc": result.test.spec_desc,
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
    this.select_json = new Manifest('/tests/manifest0.json');
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
    this.manifest.manifest_load(this.manifest_loaded.bind(this));
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

        this.manifest_iterator = new ManifestIterator(this.manifest, this.filter_array, this.test_types, this.select_json);
        this.num_tests = null;

        if (this.manifest.data === null) {
            this.start_after_manifest_load = true;
        } else {
            this.do_start();
        }
    },

    do_start: function() {
        if(this.manifest_iterator.count()>0){
            document.getElementById('start_error').style.display = "none";
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
            document.getElementById('togglePause').classList.add("button_hidden");
            document.getElementById('toggleStart').classList.remove("width_49_75");
            document.getElementById('toggleStart').classList.add("width_100");
            document.getElementById('start_error').style.display = "block";
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
        if (this.current_test.type == "manual" || this.current_test.type == "reftest"){
            if (subtests != "unjs"){
                return;
            }else{
                subtests = [];
            }
        }
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

function set_popup_cookie(cookie_name,cookie_value,cookie_exdays) {
    var d = new Date();
    d.setTime(d.getTime() + (cookie_exdays*24*60*60*1000));
    var expires = "expires="+d.toUTCString();
    document.cookie = cookie_name + "=" + cookie_value + "; " + expires;
}

function get_popup_cookie(cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for(var i=0; i<ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1);
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}

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
    try {
        if (typeof(eval(window.screen.show)) == "function") {
            window.screen.show()
        }
    } catch(e) {}

    var options = parseOptions();

    if (options.path) {
        document.getElementById('input_tests').value = options.path;
    }

    var version_dom = document.getElementById('version');

    loadconfig("/tests/version.json",version_dom);
    runner = new Runner("/tests/manifest1.json", options);
    var test_control = new TestControl(document.getElementById("testControl"), runner);
    new ManualUI(document.getElementById("manualUI"), runner);
    new VisualOutput(document.getElementById("output"), runner);

    if (options.autorun === "1") {

        runner.start(test_control.get_filter(),
                    test_control.get_test_types(),
                    test_control.get_testharness_settings());
        return;
    }
    
    document.getElementById("start_btn").disabled = true;
    
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
