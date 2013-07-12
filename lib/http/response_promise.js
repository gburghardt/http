Http.ResponsePromise = function ResponsePromise(promiser, context) {
	Http.AbstractPromise.call(this, promiser, context, ["success", "error", "complete"]);
};

Http.ResponsePromise.prototype = new Http.AbstractPromise();

Http.ResponsePromise.prototype.handleError = function(error) {
	if (typeof error === "string") {
		error = new Error(error);
	}

	this.fullfill("error", error);
};
