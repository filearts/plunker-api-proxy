var Fs = require('fs');
var Monitor = require('forever-monitor').Monitor;

exports.register = function(server, options, next) {
    var upstreamFile = require.resolve('plunker-api');
    var child = new Monitor(upstreamFile, {
        max: Number.MAX_VALUE,
        watch: false,
    });
    var started = false;

    server.route({
        method: 'GET',
        path: '/healthz',
        config: require('./routes/healthz'),
    });


    child.once('start', function () {
        started = true;

        server.log(['info', 'init'], 'Started ' + exports.register.attributes.name + '.');

        next();
    });

    child.on('error', function (e) {
        server.log(['error', 'init'], 'Upstream error ' + exports.register.attributes.name + ': ' + e.message + '.');

        if (!started) {
            started = true;

            next(e);
        }
    });

    child.once('exit', function () {
        if (!started) {
            started = true;

            server.log(['error', 'init'], 'Failed to start ' + exports.register.attributes.name + ': Upstream failed to start.');

            next(new Error('Upstream server failed to start.'));
        }
    });

    child.start();
};


exports.register.attributes = {
    name: 'upstream',
    version: '1.0.0',
    dependencies: []
};