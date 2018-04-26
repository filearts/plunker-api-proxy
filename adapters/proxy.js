var Boom = require('boom');
var Joi = require('joi');
var JSZip = require('jszip');
var Lookup = require('object-path');
var Nconf = require('nconf');
var Path = require('path');
var Promise = require('bluebird');
var Url = require('url');
var Wreck = require('wreck');
var _ = require('lodash');


var internals = {};

exports.register = function(server, options, next) {
    Promise.promisifyAll(server);

    var upstream = {
        host: Lookup.get(options.config, 'services.upstream.public.host', 'localhost'),
        port: Lookup.get(options.config, 'services.upstream.public.port', 80),
        protocol: Lookup.get(options.config, 'services.upstream.public.protocol', 'http'),
        passThrough: Lookup.get(options.config, 'services.upstream.passThrough', true),
        redirects: Lookup.get(options.config, 'services.upstream.redirects', 1),
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

    var createRouteConfig = function(config) {
        return _.extend(configDefault, config);
    };

    var methodCacheConfig = {
        expiresIn: 1000 * 60 * 60, // For now, hard-coded one hour
        cache: 'zip',
    };

    server.bind({
        server: server,
        config: options.config,
        upstream: upstream,
        upstreamUrl: upstrealUrl,
    });


    server.method('createPlunkZip', internals.createPlunkZip, {
        cache: methodCacheConfig
    });
    server.method('loadTrendingPlunks', internals.loadTrendingPlunks, {
        cache: _.extend(methodCacheConfig, {
            expiresIn: 1000 * 60 * 5
        })
    });


    server.route({
        method: 'GET',
        path: '/proxy.html',
        config: createRouteConfig({
            cache: {
                expiresIn: 1000 * 60 * 60 * 24
            }
        })
    });

    server.route({
        method: 'GET',
        path: '/tags/{any*}',
        config: internals.handleArrayEndpoint
    });

    // server.route({ method: 'GET', path: '/users/{login}/remembered', config: internals.handleDisabledEndpoint });
    // server.route({ method: 'GET', path: '/users/{login}/thumbed', config: internals.handleDisabledEndpoint });

    // server.route({ method: 'GET', path: '/plunks/remembered', config: internals.handleDisabledEndpoint });
    server.route({
        method: 'GET',
        path: '/plunks/trending',
        config: internals.handleTrendingPlunks
    });
    server.route({
        method: 'GET',
        path: '/plunks/popular',
        config: internals.handleDisabledEndpoint
    });
    server.route({
        method: 'GET',
        path: '/plunks/{plunkId}.zip',
        config: internals.handlePlunkZip
    });
    // server.route({
    //     method: 'GET',
    //     path: '/users/{login}/plunks/tagged/{tag}.zip',
    //     config: internals.handlePlunkCollectionZip
    // });


    server.route({
        method: '*',
        path: '/{any*}',
        config: createRouteConfig({})
    });

    server.log(['info', 'init'], 'Started ' + exports.register.attributes.name + '.');

    next();
};


exports.register.attributes = {
    name: 'proxy',
    version: '1.0.0',
    dependencies: [
        'config',
        'upstream',
    ]
};
internals.createPlunkZip = function(plunkId, revision, next) {
    var upstreamUrl = this.upstreamUrl;

    var buildZip = function(plunk) {
        return Promise.reduce(_.values(plunk.files), function(zipBuilder, file) {
                var filename = file.filename
                    .split("/")
                    .filter(Boolean)
                    .join("/");

                zipBuilder.file(filename, file.content);

                return zipBuilder;
            }, JSZip())
            .tap(function(zipBuilder) {
                console.log(zipBuilder);
            })
            .call("generate", {
                type: "nodebuffer"
            });
    };


    return new Promise(function(resolve, reject) {
            var urlBuilder = Url.parse(upstreamUrl, true);

            urlBuilder.pathname = Path.join(urlBuilder.pathname, "/plunks/" + plunkId);
            if (revision >= 0) urlBuilder.query.v = revision;

            var url = Url.format(urlBuilder);

            Wreck.get(url, {
                json: true
            }, function(err, resp, payload) {
                if (err) return reject(err);

                return resolve(payload);
            });
        })
        .then(buildZip)
        .nodeify(next);
};

internals.loadTrendingPlunks = function(sessid, p, pp, files, next) {
    var self = this;
    var upstreamUrl = this.upstreamUrl;

    return new Promise(function(resolve, reject) {
            var urlBuilder = Url.parse(upstreamUrl, true);

            urlBuilder.pathname = Path.join(urlBuilder.pathname, "/plunks/trending");
            urlBuilder.query.sessid = sessid;
            urlBuilder.query.p = p;
            urlBuilder.query.pp = pp;
            urlBuilder.query.files = files;

            var url = Url.format(urlBuilder);

            console.log("Upstream request", url);

            Wreck.get(url, {
                json: true
            }, function(err, resp, payload) {
                if (err) return reject(err);

                return resolve(payload);
            });
        })
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
    handler: function(request, reply) {
        reply(request.pre.zip)
            .type("application/zip");
    }
};

internals.handleTrendingPlunks = {
    cache: {
        expiresIn: 1000 * 60 * 5,
        privacy: 'public'
    },
    validate: {
        query: Joi.object({
            p: Joi.number().integer().min(1).default(1).optional(),
            pp: Joi.number().integer().min(1).max(20).default(12).optional(),
            files: Joi.string().allow("yes").default("").optional(),
            sessid: Joi.string().alphanum().required(),
        }).unknown(true)
    },
    pre: [{
        method: "loadTrendingPlunks(query.sessid, query.p, query.pp, query.files)",
        assign: "plunks",
    }],
    handler: function(request, reply) {
        reply(request.pre.plunks);
    }
};

internals.handleDisabledEndpoint = {
    handler: function(request, reply) {
        reply(Boom.resourceGone());
    }
};

internals.handleArrayEndpoint = {
    handler: function(request, reply) {
        reply([]);
    }
};
