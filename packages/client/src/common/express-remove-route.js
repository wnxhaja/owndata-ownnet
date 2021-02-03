// Adapted from the original https://github.com/brennancheung/express-remove-route#readme
// by Brennan Cheung (git@brennancheung.com) and Alessandro Romanino (a.romanino@gmail.com)

function _findRoute(path, stack) {
    let count = 0;
    let routes = [];
    stack.forEach(function(layer) {
        if (!layer) return;
        if (layer && !layer.match(path)) return;
        if (['query', 'expressInit'].indexOf(layer.name) != -1) return;
        if (layer.name == 'router') {
            routes = routes.concat(_findRoute(trimPrefix(path, layer.path),layer.handle.stack));
        } else {
            if (layer.name == 'bound ') {
                routes.push({route: layer || null, stack: stack});
            }
        }
    });
    return routes;
}

function findRoute(app, path) {
    let stack = app._router.stack;
    return (_findRoute(path, stack));
}

function trimPrefix(path, prefix) {
    // This assumes prefix is already at the start of path.
    return path.substr(prefix.length);
}


module.exports = function removeRoute(app, path, method) {
    let found;

    if (!(app._router && app._router.stack))
      return true;

    found = findRoute(app, path);

    found.forEach(function(layer) {
        let route = layer.route;
        let stack = layer.stack;

        if (route) {
            if (method === undefined){  // if no method delete all resource with the given path
                let idx = stack.indexOf(route);
                stack.splice(idx, 1);
            } else if (JSON.stringify(route.route.methods).toUpperCase().indexOf(method.toUpperCase())>=0) {
                // if method defined delete only the resource with the given path and method
                let idx = stack.indexOf(route);
                stack.splice(idx, 1);
            }
        }
    });

    return true;
};

module.exports.findRoute = findRoute;