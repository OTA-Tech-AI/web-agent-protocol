(function () {
    "use strict";

    var statusElem = document.querySelector('.status');
    var clearBtn = document.querySelector('.clear');
    var recordBtn = document.querySelector('.record');
	var pauseResumeBtn = document.querySelector('#record-pause-button-1');
    var table = document.querySelector('.events');
    var intro = document.querySelector('.intro');

	var taskInput   = document.querySelector('.task-description-input');
	var taskIdDisplay   = document.querySelector('.task-description-task-id');
	var taskLabel   = document.querySelector('.task-description-label');
	var taskLabelStart   = document.querySelector('.task-description-start');
	var taskVisibilityBtn = document.querySelector('#task-visibility-toggle-button');
	var taskSection = document.querySelector('.task-description-section');

    var eventTable = new EventTable(table);

    var recording = false;
	var paused = false;
	var taskId = "";

	// Initially disable the Task Finish button
	pauseResumeBtn.disabled = true;

	var settingsBtn      = document.querySelector('.settings-btn');
	var settingsPanel    = document.querySelector('.settings-panel');
	var hostField        = document.getElementById('collector-host');
	var portField        = document.getElementById('collector-port');
	var saveSettingsBtn  = document.getElementById('settings-save');
	var cancelSettingsBtn= document.getElementById('settings-cancel');
	var statusMsg        = document.getElementById('settings-status');
	var maskField = document.getElementById('collector-mask');

	function loadSettingsToUI() {
		try {
		  chrome.storage.sync.get(
			{ storedCollectorHost: '127.0.0.1', storedCollectorPort: 4934, maskSensitiveData:false },
			(cfg) => {
			  if (chrome.runtime?.id && document.isConnected) {
				hostField.value  = cfg.storedCollectorHost;
				portField.value  = cfg.storedCollectorPort;
				maskField.checked = !!cfg.maskSensitiveData;
			  }
			}
		  );
		} catch (e) {
		  // context was already destroyed – ignore
		}
	  }

	function saveSettingsFromUI() {
		const host = hostField.value.trim() || '127.0.0.1';
		const port = parseInt(portField.value, 10) || 4934;
		const mask = maskField.checked;
	  
		chrome.storage.sync.set(
		  {
			storedCollectorHost: host,
			storedCollectorPort: port,
			maskSensitiveData: mask
		  }
		);
	  }

	  function showSettingsPanel(show) {
		if (show) {
		  loadSettingsToUI();
		  settingsPanel.classList.remove('hidden');
		  document.querySelector('main').classList.add('hidden');
		  intro.style.display = 'none';
		} else {
		  settingsPanel.classList.add('hidden');
		  document.querySelector('main').classList.remove('hidden');
		  if(!recording){
			  intro.style.display = 'block';
		  }
		}
	  }

	  /* Open settings */
	  settingsBtn.addEventListener('click', () => showSettingsPanel(true));

	  /* Save & close */
	  saveSettingsBtn.addEventListener('click', () => {
		saveSettingsFromUI();
		showSettingsPanel(false);
	  });

	  /* Cancel just closes */
	  cancelSettingsBtn.addEventListener('click', () => showSettingsPanel(false));


	function showInput(clearValue = false) {
		if (clearValue) taskInput.value = '';
		taskInput.style.display = 'inline';
		taskLabel.style.display = 'none';
		taskIdDisplay.style.display = 'none';
		taskLabelStart.style.display = 'none';
	  }
	  
	  function showLabel(text) {
		taskLabel.textContent = text;
		taskInput.style.display = 'none';
		taskLabel.style.display = 'inline';
		taskIdDisplay.style.display = 'inline';
		taskLabelStart.style.display = 'inline';
	  }


	  taskInput.addEventListener('input', function() {
		this.style.height = 'auto';
		this.style.height = this.scrollHeight + 'px';
	  });

	  function getCurrentTaskId(){
		chrome.runtime.sendMessage({
			type: 'get-task-id',
			tabId: chrome.devtools.inspectedWindow.tabId
		  }, function(response) {
			  taskId = response.taskId;
			  taskIdDisplay.innerText = "ID: " + taskId;
		  });
	  }

	  function recordBtnHandler() {
		// ======= RECORDING START =======
		if (!recording) {
		  const desc = taskInput.value.trim();
		  /* 1. Block start if description empty */
		  if (!desc) {
			taskInput.classList.add('invalid');
			taskInput.focus();
			return;
		  }
		  taskInput.classList.remove('invalid');
	  
		  /* 2. Switch input → plain-text label */
		  showLabel(desc);
	  
		  /* 3. Begin recording */
		  ContentScriptProxy.startRecording(desc);
		  setTimeout(() => { getCurrentTaskId(); }, 1000);
		  recording = true;
		  paused    = false;
	  
		  /* 4. Update buttons */
		  recordBtn.innerText   = 'Finish Record';
		  pauseResumeBtn.disabled = false;
		  pauseResumeBtn.innerText = 'Pause';
	  
		  /* 5. Show the Hide/Show-Task toggle */
		  taskVisibilityBtn.hidden = false;
		  taskVisibilityBtn.innerText = 'Hide Task';
		  taskSection.style.display   = 'block';   // Task visible by default

		  /* Optional intro fade-out (unchanged) */
			if (intro.style.display !== 'none') {
				intro.animate([{ opacity: 1 }, { opacity: 0 }], 300)
					.onfinish = () => intro.style.display = 'none';
			}
		}

		// ======= RECORDING FINISH =======
		else {
		  ContentScriptProxy.finishRecording();
		  taskIdDisplay.innerText = '...';
	  
		  /* 1. Restore input field */
		  showInput(true);            // clear value
		  recording = false;
		  paused    = false;
	  
		  /* 2. Update buttons */
		  recordBtn.innerText   = 'Start Record';
		  pauseResumeBtn.disabled = true;
		  pauseResumeBtn.innerText = 'Pause';
		  pauseResumeBtn.classList.toggle('record-resume', paused);
		  pauseResumeBtn.classList.toggle('record-pause',  !paused);
	  
		  /* 3. Hide the Hide/Show-Task toggle, always show task input */
		  taskVisibilityBtn.hidden = true;
		  taskSection.style.display = 'block';

      eventTable.clear();

      /* Optional intro fade-out (unchanged) */
      intro.style.display = 'block';     // make it visible immediately
      intro.style.opacity = 0;           // start transparent
      intro.animate([{ opacity: 0 }, { opacity: 1 }], 300)
           .onfinish = () => (intro.style.opacity = 1);
		}

  }

	function waitForContentScript (timeoutMs = 4000) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
		bgPort.onMessage.removeListener(listener);
		reject(new Error('content-script not injected in time'));
		}, timeoutMs);

		function listener (msg) {
		if (msg?.type === 'connected') {
			clearTimeout(timer);
			bgPort.onMessage.removeListener(listener);
			resolve(true);
		}
		}
		bgPort.onMessage.addListener(listener);
	});
	}

	function getCurrentOriginPattern () {
	return new Promise(resolve => {
		chrome.devtools.inspectedWindow.eval('window.location.href',
		(url, exc) => {
			if (exc?.isException || !url) {
			console.warn('[OTA panel] could not read inspected URL', exc);
			return resolve(null);
			}
			try {
			const originPattern = new URL(url).origin + '/*';
			resolve(originPattern);
			} catch (e) {
			console.error('[OTA panel] bad URL', url, e);
			resolve(null);
			}
		});
	});
	}

	/** Ask the user (once) for host permission to the current origin and,
	 *  when granted, inject the content-script.  */
	async function ensurePagePermission () {
	// const originPattern = await getCurrentOriginPattern();
	// if (!originPattern) return false;
	// const needed = { origins: [originPattern] };
	const needed = { origins: ['*://*/*'] };
	// Already have it?
	if (await chrome.permissions.contains(needed)) return true;
	// Prompt the user
	const granted = await chrome.permissions.request(needed);
	if (!granted) return false;                      // user pressed “Deny”

	injectContentScript();                           // do the actual injection
	return waitForContentScript();                   // <- polling helper
	}

	recordBtn.addEventListener('click', async () => {
		if (!recording) {
			const ok = await ensurePagePermission();
			if (!ok) {                         // user denied → abort start
			alert('Action capturer fails to obtain access to the page.');
			return;
			}
		}
		recordBtnHandler();                  // your existing logic
	});

	taskVisibilityBtn.addEventListener('click', function () {
		if (taskSection.style.display === 'none') {
			taskSection.style.display = 'block';
			taskVisibilityBtn.innerText = 'Hide Task';
		} else {
			taskSection.style.display = 'none';
			taskVisibilityBtn.innerText = 'Show Task';
		}
	});

	taskInput.addEventListener('input', () => {
		taskInput.classList.remove('invalid');
	});

	pauseResumeBtn.addEventListener('click', function () {
		if (!recording) return;
		paused = !paused;
		pauseResumeBtn.innerText = paused ? 'Resume' : 'Pause';
		pauseResumeBtn.classList.toggle('record-resume', paused);
		pauseResumeBtn.classList.toggle('record-pause',  !paused);
		if (paused) {
			ContentScriptProxy.pauseRecording();
        } else {
            ContentScriptProxy.resumeRecording(taskLabel.textContent);
			setTimeout(() => { getCurrentTaskId(); }, 1000);
        }
	});

    clearBtn.addEventListener('click', function () {
        eventTable.clear();
    });

    // clicking on a node
    table.addEventListener('click', function (e) {
        var target = e.target;

        if (target && target.classList.contains('node') && target.dataset.nodeid) {
            if (e.shiftKey) {
                ContentScriptProxy.inspectNode(target.dataset.nodeid);
            } else {
                ContentScriptProxy.highlightNode(target.dataset.nodeid);
            }
        }
    });


    /* ------------------------------------------------------------------
    DevTools-panel  ⇆  background service-worker  robust connection
    ------------------------------------------------------------------ */

	const INJECT_FILES = [
	  'lib/purify.min.js',
	  'js/elementProcess.js',
	  'js/specialEventHandler.js',
	  'js/DOMListener.js'
	];
    let bgPort = null;               // current live Port → background SW

    /* (re)open the port if needed and install the onMessage handler */
    function openBGPort() {
        if (bgPort) return;            // already connected

        bgPort = chrome.runtime.connect({ name: 'devtools-page' });
        bgPort.onMessage.addListener(handleBGMessage);

        bgPort.onDisconnect.addListener(() => {
            console.warn('[Panel] BG port disconnected - will reopen on demand');
            bgPort = null;               // mark as dead; next sendToBG will reopen
        });
    }

    /* Safe sender – always use this instead of bgPort.postMessage(...) */
    function sendToBG(message) {
        openBGPort();                  // lazy (re)connect
        try {
            bgPort.postMessage(message);
        } catch (err) {                // “Extension context invalidated”
            console.warn('[Panel] postMessage failed – retrying', err);
            bgPort = null;               // flush broken port
            openBGPort();                // reopen
            bgPort.postMessage(message); // retry once
        }
    }

    /* ------------------------------------------------------------------
    Injection helper – unchanged except that we use sendToBG()
    ------------------------------------------------------------------ */
    function injectContentScript() {
    sendToBG({
        type: 'inject',
        tabId: chrome.devtools.inspectedWindow.tabId,
		files: INJECT_FILES
    });
    }

    /* ------------------------------------------------------------------
    Messages coming **from** the background SW
    ------------------------------------------------------------------ */
    function handleBGMessage(message) {
    switch (message.type) {
        case 'connected': {
        statusElem.classList.add('connected');
        eventTable.clear();

        if (recording) {
            ContentScriptProxy.resumeRecording(taskLabel.textContent);
            setTimeout(() => { getCurrentTaskId(); }, 1_000);
        }
        break;
        }

        case 'disconnected': {
        statusElem.classList.remove('connected');
        injectContentScript();                 // try again
        break;
        }

        case 'event':
        eventTable.addEvent(message.event);
        break;

        case 'clear-events':
        eventTable.clear();
        break;

        /* you may add more cases as needed */

        default:
        console.warn('[Panel] unknown message', message);
    }
    }

    /* ------------------------------------------------------------------
    INITIALISE: open the port and inject the content-script once
    ------------------------------------------------------------------ */
    openBGPort();
    injectContentScript();

    /* ------------------------------------------------------------------
    OPTIONAL: keep-alive pings so the SW does not time out
    ------------------------------------------------------------------ */
    setInterval(() => sendToBG({ type: 'keep-alive' }), 20_000);
})();
