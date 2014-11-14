<!doctype html>
<html>
	<head>
		<title>history.pushState/replaceState and referer headers</title>
	</head>
	<body>

		<noscript><p>Enable JavaScript and reload</p></noscript>
		<div id="log"></div>
		<script type="text/javascript">
var httpReferer = unescape("<?php print urlencode($_SERVER['HTTP_REFERER']); ?>");
var lastUrl = location.href.replace(/\/[^\/]*$/,'\/009-4.html?2345');
parent.test(function () {
	parent.assert_equals( httpReferer, lastUrl );
}, 'HTTP Referer should use the replaced state');
parent.test(function () {
	parent.assert_equals( document.referrer, lastUrl );
}, 'document.referrer should use the replaced state');
parent.done();
		</script>

	</body>
</html>