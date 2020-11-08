module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    ts: {
      tsconfig: './tsconfig.json',
      dev: {
        watch: './src'
      },
      prod: {}
    }
  });
  grunt.loadNpmTasks('grunt-ts');
  grunt.registerTask('default', ['ts:prod']);
};
