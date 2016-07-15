var Analytics = require('analytics-node')
var Nconf = require('nconf');

exports.register = function(server, options, next) {
    var env = process.env.NODE_ENV || 'development';

    Nconf.use('memory')
        .file({
            file: 'config.' + env + '.json'
        })
        .defaults({
            PORT: 8888
        });

    var analyticsConfig = Nconf.get('analytics');

    if (analyticsConfig) {
        Analytics.init(analyticsConfig);
    }
    
    if (!Nconf.get('host')) {
        return next(new Error('The `host` option is required for Plunker to run.'));
    }
    
    server.log(['info', 'init'], 'Started ' + exports.register.attributes.name + '.');
    
    next();
};


exports.register.attributes = {
    name: 'config',
    version: '1.0.0',
    dependencies: []
};