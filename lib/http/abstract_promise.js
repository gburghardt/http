Http.AbstractPromise = function(promiser, context, callbacks) {
	this.promiser = promiser || null;
	this.context = context || null;
	this.callbacks = {};
	this.pendingCallbacks = {};

	if (callbacks) {
		this.registerCallbacks(callbacks);
	}
};

Http.AbstractPromise.prototype = {

	callbacks: null,

	context: null,

	pendingCallbacks: null,

	promiser: null,

	createCallback: function(name) {
		return function(func) {
			if (this.pendingCallbacks[name]) {
				console.debug("Http.AbstractPromise#" + name + " - Executing queued up callback");
				var info = this.pendingCallbacks[name];
				func.apply(info.context, info.args);
				this.pendingCallbacks[name] = info = null;
			}
			else {
				console.debug("Http.AbstractPromise#" + name + " - Stashing callback for later use");
				this.callbacks[name] = func;
			}

			return this;
		};
	},

	fullfill: function() {
		if (arguments.length === 0) {
			throw new Error("The first argument to Http.AbstractPromise#fullfill must be the name of the promise to fullfill");
		}

		var name = arguments[0];
		var args = Array.prototype.slice.call(arguments, 1, arguments.length) || [];
		var context = this.context || this.promiser;

		args.push(this.promiser, this);

		if (this.callbacks[name]) {
			console.debug("Http.AbstractPromise#fullfill - Calling " + name + " callback immediately");
			this.callbacks[name].apply(context, args);
		}
		else {
			console.debug("Http.AbstractPromise#fullfill - No callback for " + name);
			this.pendingCallbacks[name] = {
				context: context,
				args: args
			};
		}

		return this;
	},

	handleError: function(error) {
		if (window.console && window.console.error) {
			window.console.error(error);
		}
		else {
			throw error;
		}
	},

	registerCallbacks: function(callbacks) {
		this.callbacks = {};
		var name;

		for (var i = 0, length = callbacks.length; i < length; i++) {
			name = callbacks[i];
			this[name] = this.createCallback(name);
		}
	}

};
