var Joi = require("joi");
var JSZip = require("jszip");
var Lookup = require("object-path");
var Promise = require("bluebird");
var Url = require("url");
var Wreck = require("wreck");
var _ = require("lodash");


var internals = {};

exports.register = function (server, options, next) {
  Promise.promisifyAll(server);
  
  server.log("info", "Registering proxy plugin");
  
  var upstream = {
    host: Lookup.get(options.config, "services.upstream.public.host", "localhost"),
    port: Lookup.get(options.config, "services.upstream.public.port", 80),
    protocol: Lookup.get(options.config, "services.upstream.public.protocol", "http"),
    passThrough: Lookup.get(options.config, "services.upstream.passThrough", true),
    redirects: Lookup.get(options.config, "services.upstream.redirects", 1),
  };
  
  var upstrealUrl = Url.format({
    hostname: upstream.host,
    port: upstream.port,
    protocol: upstream.protocol,
  });
  
  
  var configDefault = {
    handler: {
      proxy: upstream,
    }
  };
  
  var createRouteConfig = function (config) {
    return _.extend(configDefault, config);
  };
  
  var methodCacheConfig = {
    expiresIn: 1000 * 60 * 60, // For now, hard-coded one hour
    cache: "zip",
  };

  server.bind({
    config: options.config,
    upstream: upstream,
    upstreamUrl: upstrealUrl,
  });
  
  
  server.method("createPlunkZip", internals.createPlunkZip, { cache: methodCacheConfig });
  
  
  server.route({ method: "GET", path: "/proxy.html", config: createRouteConfig({
    cache: {
      expiresIn: 1000 * 60 * 60 * 24
    }
  })});
  
  server.route({ method: "GET", path: "/plunks/{plunkId}.zip", config: internals.handlePlunkZip });
  

  server.route({ method: "*", path: "/{any*}", config: createRouteConfig({
  })});
  
  next();  
};

exports.register.attributes = {
  pkg: require('./package.json')
};


internals.createPlunkZip = function (plunkId, revision, next) {
  var upstreamUrl = this.upstreamUrl;
  
  var buildZip = function (plunk) {
    return Promise.reduce(_.values(plunk.files), function (zipBuilder, file) {
      var filename = file.filename
        .split("/")
        .filter(Boolean)
        .join("/");
      
      zipBuilder.file(filename, file.content);
      
      return zipBuilder;
    }, JSZip())
      .tap(function (zipBuilder) {
        console.log(zipBuilder);
      })
      .call("generate", {type: "nodebuffer"});
  };
  
  
  return new Promise(function (resolve, reject) {
    var urlBuilder = Url.parse(upstreamUrl, true);
    
    urlBuilder.pathname += "/plunks/" + plunkId;
    if (revision >= 0) urlBuilder.query.v = revision;
    
    var url = Url.format(urlBuilder);
    
    Wreck.get(url, { json: true }, function (err, resp, payload) {
      if (err) return reject(err);
      
      return resolve(payload);
    });
  })
    .then(buildZip)
    .nodeify(next);
};


internals.handlePlunkZip = {
  validate: {
    params: {
      plunkId: Joi.string().regex(/^[a-zA-Z0-9]+$/).required(),
    },
    query: {
      v: Joi.number().integer().min(0).default(-1).optional(),
    }
  },
  pre: [{
    method: "createPlunkZip(params.plunkId, query.v)",
    assign: "zip",
  }],
  handler: function (request, reply) {
    reply(request.pre.zip)
      .type("application/zip");
  }
};