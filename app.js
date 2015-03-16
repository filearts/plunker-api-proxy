var Hapi = require("hapi");
var Lookup = require("object-path");
var _ = require("lodash");

var server = new Hapi.Server({
  cache: {
    engine: require("catbox-memory"),
    name: "zip",
    allowMixedContent: true, // Allow caching Buffers
    maxByteSize: 104857600 * 2, // 200mb
  },
  connections: {
    routes: {
      json: {
        space: 2,
      },
    },
  },
});

var config = _.defaults(require("./config"), {
  plugins: {},
});

var plugins = [
  {
    register: require("good"),
    options: {
      opsInterval: 1000 * 30,
      reporters: [{
        reporter: require('good-console'),
        args:[{ log: "*", error: "*", request: "*", response: "*", ops: "*" }]
      }],
    }
  }, {
    register: require("./index"),
    options: { config: config },
  }
];

server.connection({
  host: Lookup.get(config, "services.proxy.public.host", "localhost"),
  address: "0.0.0.0",
  port: Lookup.get(config, "services.proxy.local.port", 8080),
  labels: ["proxy"],
});

server.register(plugins, function (err) {
  if (err) {
    server.log("error", "Error registering plugins: " + err.message, err);
    process.exit(1);
  }
  
  server.start(function (err) {
    if (err) {
      server.log("error", "Error starting server: " + err.message, err);
      process.exit(1);
    }
    
    server.log("info", "Server running at: " + server.info.uri);
  });
  
});