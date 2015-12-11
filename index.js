var Bluebird = require('bluebird');
var Package = require('./package.json');


exports.register = function(server, options, next) {
    Bluebird.promisifyAll(server);

    server.log(['info', 'init'], 'Starting API Proxy.');


    server.registerAsync([{
        register: require('./adapters/config'),
        options: options,
    }, {
        register: require('./adapters/upstream'),
        options: options,
    }, {
        register: require('./adapters/proxy'),
        options: options,
    }])
        .nodeify(next);
};

exports.register.attributes = {
    name: Package.name,
    version: Package.version,
    dependencies: [
    ]
};