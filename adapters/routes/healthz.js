'use strict';

const Boom = require('boom');


module.exports = {
    handler,
    auth: false,
};


function handler(request, reply) {
    const server = request.server;
    const start = Date.now();

    server.inject({
        method: 'GET',
        url: '/plunks',
    }, res => {
        if (res.statusCode !== 200) {
            return reply(Boom.badGateway());
        }

        return reply({
            health: {
                upstream: {
                    latency: Date.now() - start,
                },
            },
            statusCode: 200,
        });
    });
}
