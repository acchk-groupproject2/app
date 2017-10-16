var imagesnapjs = require('imagesnapjs');
 
imagesnapjs.capture('./photos/photo2.jpg', { cliflags: '-w 2'}, function(err) {
  console.log(err ? err : 'Success!');
});