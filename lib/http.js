/**
 * namespace Http
 *
 * Namespace for all Http related methods and classes
 **/
var Http = {

	/**
	 * Http.pool -> Array
	 *
	 * An array of all transport connections available to the page.
	 **/
	pool: [],

	/**
	 * Http.availablePool -> Array
	 *
	 * All of the connections not currently being used.
	 **/
	availablePool: [],

	/**
	 * Http.lockedPool -> Array
	 *
	 * Connections currently in use.
	 **/
	lockedPool: [],

	/**
	 * Http.maxPoolSize -> Number
	 *
	 * Max number of connections in the pool.
	 **/
	maxPoolSize: 25,

	/**
	 * Http.getTransportPeriod -> Number
	 *
	 * If no connections are available, check every X number of millis
	 * for an available connection.
	 **/
	getTransportPeriod: 250,

	/**
	 * Http.getTransportMaxTries -> Number
	 *
	 * Max number of polling attempts to get an available connection before
	 * throwing an error and giving up.
	 **/
	getTransportMaxTries: 20,

	/**
	 * Http.lock(transport)
	 * - transport (Http.Transport): The transport object to lock
	 * 
	 * Lock a transport object so that it is not available for requests.
	 **/
	lock: function(transport) {
		var i = this.availablePool.length;

		while (i--) {
			if (transport === this.availablePool[i]) {
				this.availablePool.splice(i, 1);
				this.lockedPool.push(transport);
				break;
			}
		}

		transport = null;
	},

	/**
	 * Http.register(transport)
	 * - transport (Http.Transport): The transport object to register.
	 * 
	 * Register a new transport object and make it available for requests
	 * in the connection pool.
	 **/
	register: function(transport) {
		this.pool.push(transport);
		this.availablePool.push(transport);
	},

	/**
	 * Http.unregister(transport)
	 * - transport (Http.Transport): The transport object to register.
	 * 
	 * Remove a transport object from the pool.
	 **/
	unregister: function(transport) {
		var i = this.pool.length;

		while (i--) {
			if (transport === this.pool[i]) {
				this.pool.splice(i, 1);
				break;
			}
		}

		i = this.availablePool.length;
		while (i--) {
			if (transport === this.availablePool[i]) {
				this.availablePool.splice(i, 1);
				break;
			}
		}

		i = this.lockedPool.length;
		while (i--) {
			if (transport === this.lockedPool[i]) {
				this.lockedPool.splice(i, 1);
				break;
			}
		}

		transport = null;
	},

	/**
	 * Http.release(transport)
	 * - transport (Http.Transport): The transport object to register.
	 * 
	 * Release a transport object and make it available for requests.
	 **/
	release: function(transport) {
		var i = this.lockedPool.length;

		while (i--) {
			if (transport === this.lockedPool[i]) {
				this.lockedPool.splice(i, 1);
				this.availablePool.push(transport);
				break;
			}
		}

		transport = null;
	},

	_getTransport: function(callback) {
		var transport = null;

		if (this.availablePool.length) {
			// connections are available
			transport = this.availablePool.shift();
			this.lockedPool.push(transport);
			callback(transport);
		}
		else if (this.pool.length < this.maxPoolSize) {
			// no connections available, but we can create another one
			transport = new Http.Transport();
			Http.lock(transport);
			callback(transport);
		}
		else {
			// max pool size reached, wait for a connection to free up
			var tries = 0;

			var timerCallback = function() {
				if (Http.availablePool.length) {
					transport = Http.availablePool.shift();
					Http.lockedPool.push(transport);
					callback(transport);
				}
				else if (tries < Http.getTransportMaxTries) {
					tries++;
					setTimeout(timerCallback, Http.getTransportPeriod);
				}
				else {
					throw new Error("No connections became available after waiting " + (Http.getTransportPeriod * Http.getTransportMaxTries / 1000) + " seconds.");
				}
			};

			setTimeout(timerCallback, Http.getTransportPeriod);
		}
	},

	/**
	 * Http.get(options) -> Http.Transport.ResponsePromise
	 * - options (Object): Transport config options.
	 * 
	 * Make a GET request. Returns a promise.
	 **/
	get: function(options) {
		return this._sendRequest(Http.Transport.METHOD_GET, options);
	},

	/**
	 * Http.post(options) -> Http.Transport.ResponsePromise
	 * - options (Object): Transport config options.
	 * 
	 * Make a POST request. Returns a promise.
	 **/
	post: function() {
		return this._sendRequest(Http.Transport.METHOD_POST, options);
	},

	/**
	 * Http.put(options) -> Http.Transport.ResponsePromise
	 * - options (Object): Transport config options.
	 * 
	 * Make a PUT request. Returns a promise.
	 **/
	put: function() {
		return this._sendRequest(Http.Transport.METHOD_PUT, options);
	},

	/**
	 * Http.del(options) -> Http.Transport.ResponsePromise
	 * - options (Object): Transport config options.
	 * 
	 * Make a DELETE request. Returns a promise.
	 **/
	del: function() {
		return this._sendRequest(Http.Transport.METHOD_DELETE, options);
	},

	/**
	 * Http.head(options) -> Http.Transport.ResponsePromise
	 * - options (Object): Transport config options.
	 * 
	 * Make a HEAD request. Returns a promise.
	 **/
	head: function() {
		return this._sendRequest(Http.Transport.METHOD_HEAD, options);
	},

	_sendRequest: function(method, options) {
		options.method = method;

		var promise = Http.Transport.createResponsePromise(null, options.context || null);

		this._getTransport(function(transport) {
			promise.promiser = transport;
			transport.setOptions(options);
			transport.send(options.params || null, options.body || null, promise);
		});

		return promise;
	},

	/**
	 * Http.createTransport() -> XMLHttpRequest
	 * 
	 * Factory method for generating new Ajax objects. Stub this method out
	 * for better unit testing.
	 **/
	createTransport: function() {
		return new XMLHttpRequest();
	}

};
