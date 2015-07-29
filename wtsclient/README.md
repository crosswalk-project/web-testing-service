## How to pack Crosswalk WTS client APP on Ubuntu for Android platform?
* Download Crosswalk SDK and unzip it:  
    `unzip crosswalk-version.zip -d path/to/`  
    `cd path/to/crosswalk-version`  
* The command line below is the example to pack shared mode WTS client APP which points to http://wts.crosswalk-project.org:  
    `python make_apk.py --package=org.xwalk.wtsclient --mode=shared --manifest=path/to/web-testing-service/wtsclient/src/manifest.json`
* Install the WTS client and follow the APP's popup to install Crosswalk Runtime library from play store, or download the library and install it by yourself. 
* The latest public released apk hosts `releases/Wtsclient_*.apk` which based on Crosswalk 14.43.343.6 release.
* Use the same command line to build the test application which contains the input box and selection box for WTS instance with different URL:
    `python make_apk.py --package=org.xwalk.wtsclient --mode=shared --manifest=path/to/web-testing-service/wtsclient/test/manifest.json`
