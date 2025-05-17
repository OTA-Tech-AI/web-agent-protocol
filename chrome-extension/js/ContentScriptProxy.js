(function () {
    "use strict";

    function callCommand(cmd) {
        chrome.devtools.inspectedWindow.eval(
            cmd,
            {useContentScriptContext: true},
            function (isException, result) {
                if (isException || chrome.runtime.lastError) {
                    console.error('Content script command call failed.', cmd, result, chrome.runtime.lastError);
                }
            }
        );
    }

	function jsArg(str) {
		// safely quote argument for eval
		return JSON.stringify(str);
	}

    window.ContentScriptProxy = {
        inspectNode: function (nodeId) {
            callCommand('inspect(domListenerExtension.getNode(' + nodeId + '))');
        },
        highlightNode: function (nodeId) {
            callCommand('domListenerExtension.highlightNode(' + nodeId + ')');
        },
        startRecording: function (desc) {
            callCommand(`domListenerExtension.startTaskRecording(${jsArg(desc)})`);
        },
        pauseRecording: function () {
            callCommand('domListenerExtension.pauseTaskRecording()');
        },
		resumeRecording: function (desc) {
			callCommand(`domListenerExtension.resumeTaskRecording(${jsArg(desc)})`);
		},
		finishRecording: function () {
			callCommand('domListenerExtension.finishTaskRecording()');
		}
    };
})();
