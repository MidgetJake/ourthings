/** @module Queue */
import Define from './define.js';
import Templates from './internals/templates';

/**
 * @classdesc
 *
 * The main queue class
 *
 * @author Richard Reynolds richard@nautoguide.com
 *
 * @example
 * // queue = new Queue();
 *
 */
export default class Queue {

	/**
	 * Class constructor
	 */
	constructor() {

		self = this;

		/**
		 * Create our DEFINE object for
		 * @type {Define}
		 */
		self.DEFINE = new Define();
		/**
		 * Our Queue array
		 *
		 * @type {Array}
		 */
		self.queue = [];

		/**
		 * Templates to be loaded
		 * @type {Array}
		 */
		self.templates = [];


		/**
		 * Create a fragment for big dom inserts
		 * @type {DocumentFragment}
		 */
		self.fragment = document.createDocumentFragment();

		/**
		 * Se our status
		 * @type {number}
		 */
		self.status = self.DEFINE.STATUS_LOADING;

		/**
		 * Our queue process ID
		 * @type {number}
		 */
		self.pid=0;

		/**
		 * Default time for process to be executed after
		 * TODO Platform test / tune
		 * @type {number}
		 */
		self.defaultTimer=10;

		/**
		 * The actual objects that can run
		 * @type {{}}
		 */
		self.queueables={};

		/**
		 * TODO THIS IS A HACK FOR TESTING, need dynamic loader
		 */
		self.queueables.templates=new Templates(self);

		/**
		 * Load the templates.json
		 */
		fetch('templates.json', {
			headers: {
				'Content-Type': 'application/json'
			}
		})
			.then(response => self.handleFetchErrors(response))
			.then(response => response.json() )
			.then(function (response) {
				/**
				 * Conver the response to json and start the loader
				 */
				self.templates = response;
				self.templateLoader();
			})
			.catch(function (error) {
				console.error('Error:', error);
				console.info("Warning this error is probably fatal as I have no templates to load")
			});
	}

	/**
	 * Error Handler for fetch calls
	 * @param response {object} - Fetch response object
	 * @returns {Object}
	 */
	handleFetchErrors(response) {
		if (!response.ok) {
			self.status=self.DEFINE.STATUS_ERROR;
			throw Error(response.statusText);
		}
		return response;
	}

	/**
	 * Loads templates from the template stack. Recursively calls self until stack is empty
	 * @param {void}
	 * @returns {void}
	 */
	templateLoader() {
		let self=this;
		/**
		 *  Are there any templates to load?
		 *
		 *  If not then we dump the fragment into the dom
		 */
		if (this.templates.length === 0) {
			console.log('Done Loading');
			document.head.appendChild(self.fragment);
			// Clean up the fragment
			self.fragment=document.createDocumentFragment();
			/**
			 * Set our status and then process the init template
			 * @type {number}
			 */
			self.status=self.DEFINE.STATUS_LOADED;
			/**
			 *  TODO once queue generation is working this this pushing to the queue
			 *  As currently this is a chain of promises and so everything will error trap back to the loader
			 */
			self.templateProcessor("init",false);
			self.status=self.DEFINE.STATUS_RUNNING;
			return;
		}

		/**
		 * Pop the template off the stack
		 * @type {string}
		 */
		let template = this.templates.pop();

		fetch(template, {
			headers: {
				'Content-Type': 'test/html'
			}
		})
			.then(response => self.handleFetchErrors(response))
			.then(response => response.text())
			.then(function (response) {

				/**
				 * Get the template we were sent and add it to the fragment for insertion into the dom
				 *
				 * We wrap it in meta tag, this helps improve render speed but still stuck with an innerHTML
				 * as we don't know the content
				 *
				 */
				let text = response;
				let meta = document.createElement('meta');
				meta.setAttribute("name", "generator");
				meta.setAttribute("content", template);
				meta.innerHTML=text;
				self.fragment.appendChild(meta);

				/**
				 *  Call our self again to process any more templates
				 */
				self.templateLoader();
			})
			.catch(function (error) {
				console.error('Error:', error);
				console.info("Warning this error is probably fatal as a template specified in templates.json has failed to load or wont process");
			});
	};

	/**
	 * Template processor
	 * Takes a template, process it and places into the dom
	 * @param templateId {string} - ID of the template
	 * @param targetId {string|false} - Place in the dom the put the result. In the event of false we process without dom
	 * @return {boolean} - success status
	 */
	templateProcessor(templateId, targetId) {
		let self=this;
		let templateDom = document.getElementById(templateId);
		let targetDom=undefined;
		let templateHTML = templateDom.innerHTML;

		/**
		 *  TODO Process the template
		 */

		let pharsedTemplate=self.templatePharse(templateHTML);

		if(targetId!==false) {
			targetDom=document.getElementById(targetId);
			self.renderToDom(targetDom,pharsedTemplate);
		}
		return true;
	}

	/**
	 * Takes a template and runs any template commands contained in it to create a HTML template
	 * ready to be put into the dom
	 *
	 * @param template {string}
	 * @return {string}
	 */
	templatePharse(template) {
		let commandRegex=/[@\-](.*?\);)/;
		let match=undefined;
		let commands=[];
		let parentCommand;
		let isParent;
		/**
		 *  Locate all the commands in the template and generate an array of command objects that
		 *  are linked by a reference into the template
		 */
		while (match = commandRegex.exec(template)) {
			isParent=match[0][0]==='@';
			/**
			 * Generate this command object from the extracted string
			 * @type {Object}
			 */
			let command=self.commandParse(match[1],isParent);

			/**
			 *  In the case of an instant or sub run we don't need to leave anything in the DOM so nuke
			 */
			if(command.options.queueRun===self.DEFINE.COMMAND_INSTANT||command.options.queueRun===self.DEFINE.COMMAND_SUB) {
				template = template.replace(match[0], "");
			} else {
				template = template.replace(match[0], "#CMD" + commands.length + ";");
			}
			/**
			 *  Is this a @parent or a -child?
			 */
			if(isParent) {
				// Set the parent point to current position
				parentCommand=commands.length;
				/**
				 *  Is this an event (in which case we need to bind events later). We know this use case because an
				 *  event will not be instant and it will be a parent
				 */
				if(command.options.queueRun!==self.DEFINE.COMMAND_INSTANT) {
					/**
					 *  We need to re-extract the command from the template and find the HTML element that this
					 *  belongs to
					 *
					 *  TODO Stub for now as we need to get a working queue first
					 */
					//let elementMatch=template.match(//)
				}

				commands.push(command);
			} else {
				// If the parent has just been created it won't have child structure
				if(commands[parentCommand].commands===undefined) {
					commands[parentCommand].commands=[];
				}
				// Put the command in the parents
				commands[parentCommand].commands.push(command);
			}
		}
		// Add the instants to the active queue
		self.commandsQueue(commands);
		return template;
	}

	/**
	 * Take the commands array with command objects in it and add them to the queue *if* they are
	 * marked as instant. IE ready to execute
	 *
	 * @param commandObj
	 */
	commandsQueue(commandObj) {
		let self=this;
		for(let command in commandObj) {
			if(commandObj[command].options.queueRun==self.DEFINE.COMMAND_INSTANT) {

				self.queue.push(commandObj[command]);
			}
		}
		/**
		 *  Trigger a queue process
		 */
		self.queueProcess();
	}

	/**
	 * Force a queue processing
	 *
	 * This launches the actual objects using a timeout
	 */
	queueProcess() {
		let self=this;
		/**
		 *  TODO Only implementing basic queue here for testing. Concepts of active componets etc need importing
		 *  for moho
		 */
		for(let item in self.queue) {
			/**
			 *  Look for items that are QUEUE_ADDED as they need processing
			 *
			 *  Ensure the component is online
			 */
			if(self.queue[item].state===self.DEFINE.QUEUE_ADDED&&self.queueables[self.queue[item].queueable].ready) {
				/**
				 * Update our state to be running
				 * @type {number}
				 */
				self.queue[item].state=self.DEFINE.QUEUE_RUNNING;
				/**
				 * Assign a pid
				 * @type {number}
				 */
				self.queue[item].pid=self.pid;
				self.pid++;
				/**
				 * Check if any specific timing is needed
				 * @type {*|number}
				 */
				self.queue[item].options.queueTimer=self.queue[item].options.queueTimer||self.defaultTimer;

				/**
				 *  Launch the function as a time out (so we get control back)
				 */

				setTimeout(function () {
					self.queueables[self.queue[item].queueable].start(self.queue[item].pid,self.queue[item].command,self.queue[item].json,self);
				}, self.queue[item].options.queueTimer);
			}
		}
	}

	finished(pid,mode) {
		let self=this;
		for(let item in self.queue) {
			if(self.queue[item].state===self.DEFINE.QUEUE_RUNNING) {
				self.queue[item.state]=self.DEFINE.QUEUE_FINISHED;
				return;
			}
		}
	}

	/**
	 * This will take a command string in the format object.command({},{}); and split it down
	 * into it parts as an object
	 *
	 * TODO no concept of the context of the command IE was it from inside a div that need binding?
	 * @param command {string}
	 * @return {object}
	 */
	commandParse(command,isParent) {
		let self=this;
		let commandObject={};
		// Find the actual command
		let commandArray=command.match(/(.*?)\(/)[1].split('.');
		commandObject.queueable=commandArray[0];
		commandObject.command=commandArray[1];
		// Strip as we go to make follow up regex easier
		command=command.replace(/.*?\(/,'');
		// Find first json arg
		let json=command.match(/(\{.*?\})/);
		command=command.replace(/\{.*?\}[,]{0,1}/,'');
		if(command[1]) {
			commandObject.json = JSON.parse(json[1]);
		} else {
			commandObject.json={};
		}

		// Find second json arg
		let jsonOptions=command.match(/(\{.*?\})/);
		if(Array.isArray(jsonOptions) && jsonOptions[1]) {
			commandObject.options = JSON.parse(jsonOptions[1]);
		} else {
			commandObject.options={};
		}
		/**
		 * Set our default options if they haven't been set
		 *
		 * We must always have a queueRun object if its not set (normally by instant) then its either an event in
		 * which case it must be a parent or failing then its a sub
		 *
 		 */
		commandObject.options.queueRun=commandObject.options.queueRun||(isParent? self.DEFINE.COMMAND_EVENT:self.DEFINE.COMMAND_SUB);
		commandObject.state=self.DEFINE.QUEUE_ADDED;
		return commandObject;
	}

	/**
	 * Render some text/html to the dom
	 * @param domObject {object} - The object in the dom to write to
	 * @param text {string} - The text/HTML to write
	 * @param mode {number} - Mode to use while writing see define.js
	 * @return {boolean}
	 */
	renderToDom(domObject,text,mode) {
		let self=this;
		mode=mode||self.DEFINE.RENDER_INSERT;
		switch(mode) {
			case self.DEFINE.RENDER_INSERT:
				domObject.innerHTML=text;
				break;
		}
		return true;
	}


}