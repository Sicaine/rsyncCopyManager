var database = require('./database.js');
var Server = require('./server.js');

var ServerManager = module.exports = function() {
    var servers = {};
    var api = {};

    api.addServer = function(server) {
        servers[server.id] = {
            modelInstance: server,
            manager: new Server(server)
        };
    };

    database(function(err, models) {
        if (err) {
            throw err;
        }

        models.Server.all().success(function(s) {
            s.forEach(api.addServer);
        });
    });

    return api;
};
