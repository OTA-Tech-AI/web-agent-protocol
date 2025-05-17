module.exports = function (grunt) {
  "use strict";

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    jshint: {
      files: ['Gruntfile.js', 'js/**/*.js'],
      options: {
        esversion: 6,
        evil: true,
        camelcase: true,
        curly: true,
        eqeqeq: true,
        noempty: true,
        strict: true,
        loopfunc: true,
        globals: {
          console: true,
          document: true
        }
      }
    },
    csslint: {
      src: ['css/*.css'],
      options: {
        ids: false,
        'compatible-vendor-prefixes': false,
        'fallback-colors': false
      }
    },
    zip: {
      'wap_browser_action_capturer-<%= pkg.version %>.zip': ['css/**/*', 'ico/logo_*.png', 'js/**/*', 'other/**/*', '*.html', 'manifest.json']
    }
  });

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-csslint');
  grunt.loadNpmTasks('grunt-zip');

  grunt.registerTask('default', ['jshint']);
  grunt.registerTask('prod', ['zip']);
};
