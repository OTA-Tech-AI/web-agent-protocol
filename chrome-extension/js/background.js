(function () {
    "use strict";

	const taskIdMap = {};
	const lastPageGoToTimestamps = {};
	let collectorHost = "127.0.0.1";
	let collectorPort = 4934;

	const DEBOUNCE_MS = 5000;
	const pendingByKey = new Map(); // key → {timer,payload}

	function generateTaskId() {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
					+ 'abcdefghijklmnopqrstuvwxyz'
					+ '0123456789';
		let id = '';
		for (let i = 0; i < 16; i++) {
		  id += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return id;
	}

	chrome.storage.sync.get(
		{ storedCollectorHost: '127.0.0.1', storedCollectorPort: 4934 },
		({ storedCollectorHost, storedCollectorPort }) => {
			collectorHost = storedCollectorHost;
			collectorPort = storedCollectorPort;
		}
	);

	chrome.storage.onChanged.addListener((changes, area) => {
		if (area === 'sync' && 'storedCollectorHost' in changes) {
			collectorHost = changes.storedCollectorHost.newValue;
		}
		if (area === 'sync' && 'storedCollectorPort' in changes) {
			collectorPort = changes.storedCollectorPort.newValue;
		}
	});
	

	function sendDataToCollectorServer(data){
		const url = `http://${collectorHost}:${collectorPort}/action-data`;
		// Optionally send a response back.
		fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data)
			})
			.then(response => response.json())
			.then(data => {
			console.log("[OTA DOM Background]: Data sent to server successfully:", data);
			})
			.catch(err => {
			console.error("[OTA DOM Background]: Error sending data to server:", err);
			});
	}


	function _queue(payload){
		console.log(payload)
		const key    = payload.eventHash;
		const timer  = setTimeout(() => {
			sendDataToCollectorServer(payload);
			pendingByKey.delete(key);
		}, DEBOUNCE_MS);

		pendingByKey.set(key, { timer, payload });
	}

	/**
	 * Puts a payload into the de-dupe queue.
	 * - if we already hold something for the same eventHash …
	 *      • keep an existing *submit* unless the newcomer is also submit
	 *      • otherwise a *submit* replaces a non-submit **immediately**
	 *      • normal → normal   just resets the timer & stores the newer one
	 */
	function enqueueByHash(payload){
		const key      = payload.eventHash;
		const existing = pendingByKey.get(key);

		// no entry yet ➜ just queue it
		if (!existing){
			_queue(payload);
			return;
		}

		const oldType = existing.payload.type;
		const newType = payload.type;

		/* ----------------   submit logic   ---------------- */

		// 1. Existing is <submit>
		if (oldType === 'submit'){
			if (newType === 'submit'){              // submit → submit   (update)
				clearTimeout(existing.timer);
				_queue(payload);                      // schedule new timer
			}
			/* else  submit → non-submit   → keep the original; ignore newcomer */
			return;
		}

		// 2. Existing is *not* <submit>  …
		if (newType === 'submit'){                // non-submit → submit  (promote)
			clearTimeout(existing.timer);           // discard old pending event
			sendDataToCollectorServer(payload);     // send submit immediately
			pendingByKey.delete(key);               // nothing left to debounce
			return;
		}

		/* -------------   normal update path   ------------- */

		// non-submit  →  non-submit   (replace & reset timer)
		clearTimeout(existing.timer);
		_queue(payload);
	}

    chrome.runtime.onConnect.addListener(function (port) {
        if (port.name === 'devtools-page') {
            handleDevToolsConnection(port);
        } else if (port.name === 'content-script') {
            handleContentScriptConnection(port);
        }
    });

    var devToolsPorts = {};
    var contentScriptPorts = {};
	const pageContentStore = {};

    function handleDevToolsConnection(port) {
        var tabId;

        var messageListener = function (message, sender, sendResponse) {
            console.log('[OTA DOM Background]: devtools panel', message, sender);

            if (message.type === 'inject') {
                tabId = message.tabId;
                devToolsPorts[tabId] = port;

				chrome.scripting.executeScript({
					target: { tabId: message.tabId },
					files: [message.scriptToInject]
				}, (injectionResults) => {
					if (chrome.runtime.lastError) {
						console.log('[OTA DOM Background]: Error injecting script', chrome.runtime.lastError);
					} else {
						console.log('[OTA DOM Background]: Script injected successfully', injectionResults);
					}
				});
            } else {
                //pass message from DevTools panel to a content script
                if (contentScriptPorts[tabId]) {
                    contentScriptPorts[tabId].postMessage(message);
                }
            }
        };

        port.onMessage.addListener(messageListener);

        port.onDisconnect.addListener(function () {
            devToolsPorts[tabId] = undefined;
            contentScriptPorts[tabId] = undefined;
            port.onMessage.removeListener(messageListener);
        });
    }

    function handleContentScriptConnection(port) {
        var tabId = port.sender.tab.id;

        contentScriptPorts[tabId] = port;

        var messageListener = function (message, sender, sendResponse) {
            console.log('[OTA DOM Background]: content script status: ', message.type, ', tab ID: ', tabId);

            //pass message from content script to the appropriate DevTools panel
            if (devToolsPorts[tabId]) {
                devToolsPorts[tabId].postMessage(message);
            }
        };

        port.onMessage.addListener(messageListener);

        port.onDisconnect.addListener(function () {
            port.onMessage.removeListener(messageListener);

            //let devtools panel know that content script has disconnected
            if (devToolsPorts[tabId]) {
                devToolsPorts[tabId].postMessage({
                    type: 'disconnected'
                });
            }
        });
    }

	chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
		const { type } = message;
		const tabId    = sender?.tab?.id;                  // may be undefined for non‑tab senders
	  
		switch (type) {
		  case 'send-summary-event':
		  case 'submit': {
			// sendDataToCollectorServer(message.summaryEvent);
			enqueueByHash(message.summaryEvent);
			sendResponse({ status: 'success' });
			break;
		  }
	  
		  case 'input-value-changed': {
			const lastTs = lastPageGoToTimestamps[tabId];
			const curTs  = message.summaryEvent.actionTimestamp;
			if (lastTs && curTs - lastTs < 500) {          // ignore click‑then‑blur duplicates
			  console.log(`[OTA] input blur ignored in tab ${tabId}`);
			  return false;
			}
			// sendDataToCollectorServer(message.summaryEvent);
			enqueueByHash(message.summaryEvent);
			break;
		  }
	  
		  case 'page-go-to': {
			const clickData       = message.clickData;
			const curTs           = clickData?.actionTimestamp;
			const lastTs          = lastPageGoToTimestamps[tabId];
	  
			if (lastTs && curTs - lastTs < 500) {          // duplicate suppression
			  console.log(`[OTA] duplicate click ignored for tab ${tabId}`);
			  return false;
			}
			lastPageGoToTimestamps[tabId] = curTs;
			// sendDataToCollectorServer(clickData);
			enqueueByHash(clickData);
			break;
		  }
	  
		  case 'update-page-content': {
			pageContentStore[tabId] = message.sanitizedPageHTML;
			sendResponse({ status: 'success', taskId: taskIdMap[tabId] });
			return true;                                   // keep channel open for async
		  }
	  
		  case 'delete-page-content': {
			delete pageContentStore[tabId];
			console.log(`[OTA] page content deleted for tab ${tabId}`);
			sendResponse({ status: 'success' });
			return true;
		  }
	  
		  case 'task-start': {
			const newId             = generateTaskId();
			taskIdMap[tabId]        = newId;
			pageContentStore[tabId] = message.summaryEvent.pageHTMLContent;
			message.summaryEvent.taskId = newId;
			// sendDataToCollectorServer(message.summaryEvent);
			enqueueByHash(message.summaryEvent);
			sendResponse({ status: 'success', taskId: newId });
			return true;
		  }
	  
		  case 'task-finish': {
			// sendDataToCollectorServer(message.summaryEvent);
			enqueueByHash(message.summaryEvent);
			delete taskIdMap[tabId];
			sendResponse({ status: 'success' });
			return true;
		  }
	  
		  case 'get-task-id': {
			sendResponse({ status: 'success', taskId: taskIdMap[message.tabId] });
			return true;
		  }

		  default:
			break;
		}
		// For synchronous branches we fall through and return false
		return false;
	  });

	chrome.tabs.onRemoved.addListener(function(tabId) {
		delete pageContentStore[tabId];
		delete taskIdMap[tabId];
	});

	chrome.webNavigation.onCommitted.addListener(function(details) {
		const tabId = details.tabId;

		// if we don't find the pageContentStore for current tabId, it means
		// users do not switch on the recording, so ignore this action
		if(!pageContentStore[tabId]){ return false; }

		// Optionally, determine if this navigation was caused by a back button
		if (details.transitionQualifiers && details.transitionQualifiers.includes('forward_back')) {
			console.log("[OTA DOM Background]: GO BACK or GO FORWARD navigation detected in tab:", tabId);
			var summaryEvent = {
				taskId: taskIdMap[tabId],
				type: "go-back-or-forward",
				actionTimestamp: Date.now(),
				eventTarget: {
					type: "navigation",
					target: details.url
				},
				allEvents: "",
				pageHTMLContent: pageContentStore[tabId]
			};
			// sendDataToCollectorServer(summaryEvent);
			enqueueByHash(summaryEvent);
		}
	  });

})();
