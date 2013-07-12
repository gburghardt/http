/**
 * class Http.Transport < Object
 *
 * This class wraps a native Ajax object and bakes in many
 * useful lifecycle enhancements to HTTP requests, including
 * error handling. Adheres to the XMLHttpRequest interface,
 * so this should be a drop in replacement for native Ajax.
 **/
Http.Transport = function Transport(options) {
	this.xhr = Http.createTransport();
	this.setOptions(options || {});
	Http.register(this);
};

Http.Transport.METHOD_GET = "GET";
Http.Transport.METHOD_POST = "POST";
Http.Transport.METHOD_PUT = "PUT";
Http.Transport.METHOD_DELETE = "DELETE";
Http.Transport.METHOD_HEAD = "HEAD";

Http.Transport.TYPE_JSON = "text/json";
Http.Transport.TYPE_XML = "text/xml";
Http.Transport.TYPE_HTML = "text/html";
Http.Transport.TYPE_CSV = "text/csv";
Http.Transport.TYPE_TEXT = "text/plain";
Http.Transport.TYPE_JAVASCRIPT = "text/javascript";

Http.Transport.prototype = {

	/**
	 * Http.Transport#options -> Object
	 * - async (boolean): Whether or not this request locks the browser UI
	 * - body (mixed): The string or XML document to pass along in the request body
	 * - context (Object): The context of all promise callbacks. Sets the value of
	 *                     "this" when the promise callbacks are invoked.
	 * - headers (Object): Key-value pairs of raw HTTP headers.
	 * - method (String): The HTTP method (verb) to use for this request
	 * - params (String|Object): The params to pass along in the body or query string.
	 *                           If an object is given, they are assumed to be
	 *                           key-value pairs that are then escaped. Strings are
	 *                           assumed to be properly escaped.
	 * - password (String): The plain text password for HTTP authentication. Yuck.
	 * - type (String): The mime type for the request.
	 * - url (String): The URL to make the request to
	 * - username (String): The plain text username for HTTP authentication. Yuck.
	 *
	 * Config options for this transport.
	 **/
	options: {
		async: true,
		body: null,
		context: null,
		headers: {
			"X-Requested-With": "XMLHttpRequest"
		},
		method: Http.Transport.METHOD_POST,
		params: {},
		password: null,
		type: Http.Transport.TYPE_JSON,
		url: null,
		username: null
	},

	/**
	 * Http.Transport#responseText -> Document
	 *
	 * The raw response from the server. Null before the request is complete.
	 **/
	responseText: null,

	/**
	 * Http.Transport#responseXML -> Document
	 *
	 * The XML document from the Ajax response, null before the request
	 * has been completed.
	 **/
	responseXML: null,

	/**
	 * Http.Transport#readyState -> Number
	 *
	 * The Ajax ready state copied from the Ajax object.
	 **/
	readyState: 0,

	/**
	 * Http.Transport#status -> Number
	 *
	 * The Ajax status copied from the Ajax object. Null before the request
	 * has been completed.
	 **/
	status: null,

	/**
	 * Http.Transport#xhr -> XMLHttpRequest
	 *
	 * The Ajax object, or any other object adhering to its interface.
	 **/
	xhr: null,

	/**
	 * Http.Transport#abort()
	 * 
	 * Aborts an active Ajax request and releases this transport object back
	 * to the pool.
	 **/
	abort: function() {
		this._release();
		this.xhr.abort();
	},

	/**
	 * Http.Transport#destroy()
	 * 
	 * Ready this transport for garbage collection. Aborts any pending
	 * requests and removes this from the pool completely.
	 **/
	destroy: function() {
		try {
			this.abort();
			this.xhr.onreadystatechange = null;
		}
		catch (error) {
			// do nothing
		}

		Http.unregister(this);

		this.options = this.reponseXML = this.xhr = null;
	},

	/**
	 * Http.Transport#getAllResponseHeaders() -> String
	 * 
	 * Pass through method to XMLHttpRequest#getAllResponseHeaders()
	 **/
	getAllResponseHeaders: function() {
		return this.xhr.getAllResponseHeaders();
	},

	/**
	 * Http.Transport#getResponseHeader() -> String
	 * 
	 * Pass through method to XMLHttpRequest#getResponseHeader()
	 **/
	getResponseHeader: function(name) {
		return this.xhr.getResponseHeader(name);
	},

	/**
	 * Http.Transport#setRequestHeader() -> String
	 * 
	 * Pass through method to XMLHttpRequest#setRequestHeader()
	 **/
	setRequestHeader: function(name, value) {
		this.xhr.setRequestHeader(name, value);
	},

	_getOnReadyStateChangeCallback: function(promise) {
		var transport = this;

		return function() {
			transport._sync();

			if (this.readyState !== 4) { return; }

			try {

				// success
				if (this.status === 200 || this.status === 201) {
					var data = this.responseXML || transport._parseResponseText(this.responseText) || this.responseText;
					promise.fullfill("success", data);
					promise.fullfill("complete");
					transport._release(transport);
				}

				// redirect errors
				else if (this.status === 301) {
					throw new Http.Transport.RedirectError("The resource at " + transport.options.url + " has moved permanently to: " + this.getResponseHeader("location"));
				}
				else if (this.status === 307) {
					throw new Http.Transport.RedirectError("The resource at " + transport.options.url + " has moved temporarily to: " + this.getResponseHeader("location"));
				}
				else if (this.status < 400) {
					throw new Http.Transport.RedirectError("Server returned a redirect error: " + this.status);
				}

				// client errors
				else if (this.status === 401 || this.status === 419) {
					throw new Http.Transport.NotAuthorizedError("Authentication required for requests to " + transport.options.method + " " + transport.options.url);
				}
				else if (this.status === 404) {
					throw new Http.Transport.NotFoundError("Server return 404 Not Found for " + transport.options.url);
				}
				else if (this.status === 409) {
					throw new Http.Transport.ResourceStateConflictError("The resource at " + transport.options.url + " has been modified.");
				}
				else if (this.status === 415) {
					throw new Http.Transport.UnsupportedMediaTypeError("Invalid media type");
				}
				else if (this.status === 422) {
					var errorMessages = null;

					try {
						errorMessages = JSON.parse(this.responseText);
					}
					catch (error) {
						errorMessages = null;
					}

					throw new Http.Transport.ClientValidationError("Validation errors occurred while processing this request", errorMessages);
				}
				else if (this.status === 429 || this.status === 420) {
					throw new Http.Transport.RequestLimitExceededError("Request limit exceeded");
				}
				else if (this.status < 500) {
					throw new Http.Transport.ClientError("Server returned client error " + this.status);
				}

				// server errors
				else if (this.status === 503) {
					throw new Http.Transport.ServiceUnavailableError("Service to " + transport.options.url + " is temporarily unavailable.");
				}
				else if (this.status === 504) {
					throw new Http.Transport.GatewayTimeoutError("The server timed out waiting for another resource.");
				}
				else if (this.status > 499) {
					throw new Http.Transport.ServerError("Server error " + this.status);
				}
			}
			catch (error) {
				transport._release(transport);
				promise.handleError(error);
				promise.fullfill("complete");
			}
		};
	},

	_lock: function() {
		Http.lock(this);
	},

	_mergeObjects: function(destination, source) {
		for (var key in source) {
			if (!source.hasOwnProperty(key)) { continue; }

			if (source[key]) {
				if (source[key].constructor === Array) {
					destination[key] = destination[key] || [];
					destination[key].push.apply(destination[key], source[key]);
				}
				else if (source[key].constructor === Object) {
					destination[key] = destination[key] || {};
					this._mergeObjects(destination[key], source[key]);
				}
				else {
					destination[key] = source[key];
				}
			}
			else {
				destination[key] = source[key];
			}
		}
	},

	mergeOptions: function(options) {
		this._mergeObjects(this.options, options);
	},

	_parseResponseText: function(responseText) {
		var data = null;

		try {
			switch (this.options.type) {
				case Http.Transport.TYPE_JSON:
					data = JSON.parse(responseText);
					break;
				default:
					data = responseText;
					break;
			}
		}
		catch (error) {
			if (window.SyntaxError && error instanceof SyntaxError) {
				// throw JSON syntax errors to aid debugging
				throw error;
			}

			// swallow all other errors
			data = null;
		}

		return data;
	},

	_release: function() {
		Http.release(this);
	},

	/**
	 * Http.Transport#send() -> Http.Transport.ResponsePromise
	 *
	 * Sends the HTTP request.
	 *
	 *
	 * Http.Transport#send(params) -> Http.Transport.ResponsePromise
	 * - params (String|Object): Query string or post params to send with the request. Overrides
	 *                           this.options.params.
	 * 
	 * Sends the HTTP request.
	 *
	 *
	 * Http.Transport#send(params, body) -> Http.Transport.ResponsePromise
	 * - params (String|Object): Query string or post params to send with the request. Overrides
	 *                           this.options.params.
	 * - body (String|Document): The body of the HTTP request.
	 * 
	 * Sends the HTTP request.
	 *
	 *
	 * Http.Transport#send(params, body, promise) -> Http.Transport.ResponsePromise
	 * - params (String|Object): Query string or post params to send with the request. Overrides
	 *                           this.options.params.
	 * - body (String|Document): The body of the HTTP request.
	 * - promise (Http.Transport.ResponsePromise): Use and return an existing promise object.
	 * 
	 * Sends the HTTP request.
	 **/
	send: function() {
		this._lock();

		// inferred arguments
		var params = (arguments.length > 0) ? arguments[0] : this.options.params;
		var body = (arguments.length > 1) ? arguments[1] : this.options.body;
		var promise = (arguments.length > 2) ? arguments[2] : Http.Transport.createResponsePromise(this, this.options.context);

		var method = this.options.method;
		var url = this.options.url;
		var xhr = this.xhr;
		var headers = this.options.headers;

		params = this._serializeParams(params);

		if (params && (method === Http.Transport.METHOD_GET || method === Http.Transport.METHOD_DELETE)) {
			url += (url.indexOf("?") > -1) ? params : "?" + params;
		}

		xhr.open(method, url, this.async, this.options.username, this.options.password);

		for (var name in headers) {
			if (!headers.hasOwnProperty(name)) { continue; }
			xhr.setRequestHeader(name, headers[name]);
		}

		if ((method === Http.Transport.METHOD_POST || method === Http.Transport.METHOD_PUT) && !body && params) {
			body = params;
		}

		if (body && body.length) {
			xhr.setRequestHeader("Content-Length", body.length);
		}

		xhr.setRequestHeader("Content-Type", this.options.type);
		xhr.onreadystatechange = this._getOnReadyStateChangeCallback(promise);
		xhr.send(body);

		xhr = params = body = headers = null;

		return promise;
	},

	_serializeParams: function(params) {
		if (!params) {
			return "";
		}
		else if (typeof params === "string") {
			return params;
		}
		else {
			var queryString = [];

			for (var key in params) {
				if (!params.hasOwnProperty(key)) { continue; }
				queryString.push(escape(key) + "=" + escape(params[key]));
			}

			return queryString.join("&");
		}
	},

	/**
	 * Http.Transport#setOptions(overrides)
	 * - overrides (Object): The option overrides
	 * 
	 * Resets and overrides default options.
	 **/
	setOptions: function(overrides) {
		var defaults = Http.Transport.prototype.options;
		var options = {};

		this._mergeObjects(options, defaults);
		this._mergeObjects(options, overrides);

		this.options = options;

		overrides = options = defaults = null;
	},

	/**
	 * Http.Transport#_sync()
	 * 
	 * Private method to synchronize properties on the transport object with
	 * corresponding properties on the xhr object. This is called each time
	 * the Ajax onreadystatechange handler is invoked.
	 **/
	_sync: function() {
		this.status = this.xhr.status;
		this.readyState = this.xhr.readyState;
		this.responseText = (this.xhr.readyState === 4) ? this.xhr.responseText : null;
		this.responseXML = (this.xhr.readyState === 4) ? this.xhr.responseXML : null;
	}

};

Http.Transport.createErrorSubClass = function(ParentKlass) {
	var ErrorKlass;

	if (ParentKlass) {
		ErrorKlass = function(message) {
			ParentKlass.call(this, message);
		};
	}
	else {
		ParentKlass = Error;
		ErrorKlass = function(message) {
			Error.call(this, message);
			this.message = message;
		};
	}

	ErrorKlass.prototype = new ParentKlass();

	return ErrorKlass;
};


Http.Transport.createResponsePromise = function(promiser, context) {
	return new Http.ResponsePromise(promiser, context)
};


// Redirection errors
Http.Transport.RedirectError = Http.Transport.createErrorSubClass();

// Client errors
Http.Transport.ClientError = Http.Transport.createErrorSubClass(); // unhandled 4xx codes
Http.Transport.NotAuthorizedError = Http.Transport.createErrorSubClass(Http.Transport.ClientError); // 401 || 419
Http.Transport.NotFoundError = Http.Transport.createErrorSubClass(Http.Transport.ClientError); // 404
Http.Transport.ResourceStateConflictError = Http.Transport.createErrorSubClass(Http.Transport.ClientError); // 409
Http.Transport.UnsupportedMediaTypeError = Http.Transport.createErrorSubClass(Http.Transport.ClientError); // 415
Http.Transport.RequestLimitExceededError = Http.Transport.createErrorSubClass(Http.Transport.ClientError); // 429 or 420 (Twitter API)
Http.Transport.ClientValidationError = function(message, errorMessages) { // 422
	Http.Transport.ClientError.call(this, message);
	this.errorMessages = errorMessages;
};
Http.Transport.ClientValidationError.prototype = new Http.Transport.ClientError();

// Server errors
Http.Transport.ServerError = Http.Transport.createErrorSubClass(); // unhandled 5xx codes
Http.Transport.ServiceUnavailableError = Http.Transport.createErrorSubClass(Http.Transport.ServerError); // 503
Http.Transport.GatewayTimeoutError = Http.Transport.createErrorSubClass(Http.Transport.ServerError); // 504