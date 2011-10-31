var sys = require('sys');
var http = require('http');
var url = require('url');
var fs = require('fs');
var path = require('path');
var util = require('util');
var exec  = require('child_process').exec;

// do: LOGGING=true node resizing_image_server.js
LOGGING = process.env.LOGGING;

sys.log("Welcome to resizer.");

var allowedGeometries = function() {
  var base = "images/resized";
  return fs.readdirSync(base).filter(function(entry) {  // Array#filter is like #select in Ruby
    return fs.statSync(path.join(base, entry)).isDirectory();
  });
}();

var resizer = {

  'server': function(request, response) {
    try {
      resizer.startTime = new Date().getTime();

      if (LOGGING) sys.log("New request: " + request.url);

      var image = new resizer.Image(url.parse(request.url).pathname);

      // if the original size image was requested, just serve it.
      if (resizer._originalSizeRequested(image)) {
        sys.log("Serving original from " + image.originalPath);
        resizer._serveFile(image.originalPath, response);
      } else {
        // look for resized image
        if (LOGGING) sys.log("Looking for resized: " + image.resizedPath);
        fs.readFile(image.resizedPath, function (err, data) {
          if(!err) {
            resizer._respond(response, 200, data);
          } else {
            // don't have this size; look for original image
            if (LOGGING) sys.log("Looking for original: " + image.originalPath);
            fs.readFile(image.originalPath, function (err, data) {
              if(!err) {
                // have original, make resized image and ship it
                resizer._resize(image, function(resizeErr) {
                  if (!resizeErr) {
                    resizer._serveFile(image.resizedPath, response);
                  } else {
                    // scaling failed
                    resizer._respond(response, 500, "");
                  }
                });
              } else {
                // don't have original, either. nothing we can do for you, buddy.
                resizer._respond(response, 404, "");
              }
            });
          }
        });
      }
    } catch (e) {
      sys.log("High-level exception caught: " + util.inspect(e));
      resizer._respond(response, 500, "Sorry, an unexpected exception ocurred.");
    }
  },

  '_originalSizeRequested': function(image) {
    // this may be dangerous.
    return !image.validGeometry();
  },

  '_serveFile': function(path, response) {
    fs.readFile(path, function (err, data) {
      if (!err) {
        resizer._respond(response, 200, data);
      } else {
        resizer._respond(response, 500, "");
      }
    });
  },
  // object to make the image paths.
  'Image': function(requestPath) {
    scope = this;
    this.validGeometry = function() {
      return ((scope.geometry != null) && !(allowedGeometries.indexOf(scope.geometry) == -1));
    };
    this.requestPath  = requestPath;
    this.requestPathParts = this.requestPath.split("/");
    // this is serious cruft and works for subdirectories only by coincidence
    this.geometry     = this.requestPathParts.length == 2 ? null : this.requestPathParts[1];
    this.resizedPath  = path.join(process.cwd(), "images", "resized", this.requestPath);
    if (this.validGeometry()) {
      sys.log("VALID GEO")
      this.originalPath = path.join(process.cwd(), "images", this.requestPath.replace(this.geometry, "originals"));
    } else {
      sys.log("INVALID GEO")
      this.originalPath = path.join(process.cwd(), "images", "originals", this.requestPath);
    }
    if (LOGGING) { sys.log(util.inspect(this)); }
  },

  '_resize': function(image, callback) {
    if (!image.validGeometry()) {
      throw "Geometry " + geometry + " not allowed";
    }
    var dir = path.dirname(image.resizedPath);

    path.exists(dir, function(exists) {
      if (LOGGING) sys.log("dir exists? " + exists);
      if (!exists) {
        fs.mkdir(dir, "0755", resizer._imagick(image, callback));
      } else {
        resizer._imagick(image, callback);
      }
    });
  },

  '_imagick': function(image, callback) {
    var args = [image.geometry, image.originalPath, image.resizedPath].map(function(a) {
      // for now we keep it simple and don't deal with umlauts etc.
      // this is the last line of defense; the upload of files with unallowed characters into the
      // "originals" directory should be prevented in the first place.
      var whitelist = /[^a-z0-9-._\/]/i;
      return a.replace(whitelist, "_");
    });
    var cmd = "convert -strip -resize " + args.join(" ");
    if (LOGGING) sys.log(cmd);
    exec(cmd, function (error, stdout, stderr) {
      if (LOGGING) {
        if (error) sys.log(error);
        sys.log(stdout);
      }
      callback(error);
    });
  },

  '_respond': function(response, statusCode, data) {
    var contentType = (statusCode == 200) ? "image/jpeg" : "text/plain";
    var headers = { "Content-Type": contentType };
    response.writeHead(statusCode, headers);
    response.write(data || String(statusCode), "binary");
    response.end();
    if (LOGGING) sys.log("HTTP Status code: " + statusCode);
    if (LOGGING) sys.log("Request processed in " + (new Date().getTime() - resizer.startTime) + "ms");
  }

};

http.createServer(resizer.server).listen(8000);