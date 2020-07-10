"use strict";

const http = require("http");
const https = require("https");
const { Transform, pipeline } = require("stream");

const Mitm = require("mitm");
const uuid = require("uuid");
const debug = require("debug")("mitm-exp");

const YESNO_INTERNAL_HTTP_HEADER = "x-yesno-internal-header-id";

class DebugTransform extends Transform {
  constructor({ id }) {
    super();
    this.id = id;
  }
  _transform(chunk, encoding, callback) {
    setTimeout((data) => {
      console.log("TODO debugTransform", this.id, { data })
    }, 1000, chunk.toString())
    callback(null, chunk);
  }
}

class Interceptor {
  constructor() {
    this.clientRequests = {};
  }

  enable() {
    const self = this;
    this.mitm = Mitm(); // eslint-disable-line new-cap

    // Monkey-patch client requests to track options.
    const onSocket = http.ClientRequest.prototype.onSocket;
    this._origOnSocket = onSocket;
    http.ClientRequest.prototype.onSocket = function (socket) {
      if (socket.__yesno_req_id !== undefined) {
        self.clientRequests[socket.__yesno_req_id].clientRequest = this;
        this.setHeader(YESNO_INTERNAL_HTTP_HEADER, socket.__yesno_req_id);
      }

      onSocket.call(this, socket);
    };

    this.mitm.on("connect", this.mitmOnConnect.bind(this));
    this.mitm.on("request", this.mitmOnRequest.bind(this));
    this.mitm.on("connection", (server) => {
      server.on("error", (err) => debug("Server error:", err));
    });
  }

  disable() {
    if (this.mitm) {
      this.mitm.disable();
      this.mitm = undefined;
    }
  }

  mitmOnConnect(socket, clientOptions) {
    // Short-circuit: passthrough real requests.
    if (clientOptions.proxying) { return socket.bypass(); }

    // Mutate socket and track options for later proxying.
    socket.__yesno_req_id = uuid.v4();
    this.clientRequests[socket.__yesno_req_id] = { clientOptions };
  }

  mitmOnRequest(
    interceptedRequest,
    interceptedResponse
  ) {
    // Re-associate id.
    const id = interceptedRequest.headers[YESNO_INTERNAL_HTTP_HEADER];
    if (!id) {
      throw new Error(`No internal id found: ${JSON.stringify({
        headers: interceptedRequest.headers
      })}`);
    }

    // Infer proxy request info.
    const { clientOptions, clientRequest } = this.clientRequests[id];
    const isHttps = interceptedRequest.connection.encrypted;
    const request = isHttps ? https.request : http.request;

    // Create request and proxy to _real_ destination.
    const proxiedRequest = request({
      ...clientOptions,
      path: clientRequest.path,
      // Add in headers, omitting our special one.
      headers: Object
        .entries(clientOptions.headers)
        .filter(([k]) => k !== YESNO_INTERNAL_HTTP_HEADER)
        .reduce((m, [k, v]) => Object.assign(m, { [k]: v }), {}),
      // Skip MITM to do a _real_ request.
      proxying: true
    });

    // Start bindings.
    interceptedRequest.on("error", (e) => debug("Error on intercepted request:", e));
    interceptedRequest.on("aborted", () => {
      debug("Intercepted request aborted");
      proxiedRequest.abort();
    });

    proxiedRequest.on("timeout", (e) => debug("Proxied request timeout", e));
    proxiedRequest.on("error", (e) => debug("Proxied request error", e));
    proxiedRequest.on("aborted", () => debug("Proxied request aborted"));
    proxiedRequest.on("response", (proxiedResponse) => {
      debug("proxied response (%d)", proxiedResponse.statusCode);
      if (proxiedResponse.statusCode) {
        interceptedResponse.writeHead(proxiedResponse.statusCode, proxiedResponse.headers);
      }

      // TODO: REMOVE?
      proxiedResponse.on("end", () => {
        console.log("TODO proxiedResponse END");
      });

      pipeline(
        proxiedResponse,
        new DebugTransform({ id: "response" }),
        interceptedResponse,
        // TODO: REMOVE?
        (err) => {
          if (err) {
            console.error("TODO: Response pipeline failed.", err);
          } else {
            console.log("TODO: Response pipeline succeeded.");
          }
        }
      );
    });

    pipeline(
      interceptedRequest,
      new DebugTransform({ id: "request" }),
      proxiedRequest,
      // TODO: REMOVE?
      (err) => {
        if (err) {
          console.error("TODO: Request pipeline failed.", err);
        } else {
          console.log("TODO: Request pipeline succeeded.");
        }
      }
    );
  }
}

module.exports = {
  Interceptor
};
