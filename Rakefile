require 'rake'

task :setup_directories do
  base_dir = File.join(File.dirname(__FILE__), 'images')
  system("mkdir -p #{File.join(base_dir, 'originals')}")
  geometries = %w(100x20 200) # see http://is.gd/cjcci for other geometries
  geometries.each do |size|
    system("mkdir -p #{File.join(base_dir, 'resized', size)}")
  end
end