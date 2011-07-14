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
    resizer.startTime = new Date().getTime();
    
    var image = new resizer.Image(url.parse(request.url).pathname);
    if (LOGGING) sys.log("New request for image: " + image.requestPath);

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
                fs.readFile(image.resizedPath, function (err, data) {
                  if (!err) {
                    resizer._respond(response, 200, data);
                  } else {
                    // scaling says true but can't access file
                    resizer._respond(response, 500, "");
                  }
                });
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
  },
  
  // object to make the image paths.
  'Image': function(requestPath) {
    this.requestPath  = requestPath;
    this.geometry     = this.requestPath.split("/")[1];
    this._ensureValidGeometry(this.geometry);
    this.resizedPath  = path.join(process.cwd(), "images", "resized", this.requestPath);
    this.originalPath = path.join(process.cwd(), "images", this.requestPath.replace(this.geometry, "originals"));
    if (LOGGING) { sys.log(util.inspect(this)); }
  },
  
  '_ensureValidGeometry' = function(geometry) {
    if (allowedGeometries.indexOf(this.geometry) == -1) {
        throw "Geometry " + this.geometry + " not allowed";
    }
  },
  
  '_resize': function(image, callback) {
    if(!RegExp(/^[0-9x]+$/).test(image.geometry)) {
      throw "Can't deal with this geometry at the moment (it needs to be escaped for the FS)";
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
    var cmd = ["convert -strip -resize", image.geometry, image.originalPath, image.resizedPath].join(" ");
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
    if (statusCode == "200") {
      contentType = "image/jpeg";    
    } else {
      contentType = "text/plain";
    }
    var headers = { "Content-Type": contentType };
    response.writeHead(statusCode, headers);
    response.write(data || "Sorry, no data. Please check the log.", "binary");
    response.end();
    if (LOGGING) sys.log("HTTP Status code: " + statusCode);
    if (LOGGING) sys.log("Request processed in " + (new Date().getTime() - resizer.startTime) + "ms");
  }

};

http.createServer(resizer.server).listen(8000);