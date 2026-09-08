require 'xcodeproj'

project_path = 'ios/App/App.xcodeproj'
project = Xcodeproj::Project.open(project_path)

app_target = project.targets.find { |t| t.name == 'App' }
raise "App target not found!" unless app_target

# Configure App target entitlements
app_target.build_configurations.each do |config|
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
end

# Check if CooklyShare target already exists
share_target = project.targets.find { |t| t.name == 'CooklyShare' }

if share_target.nil?
  puts "Creating CooklyShare target..."
  share_target = project.new_target(:app_extension, 'CooklyShare', :ios, '15.0')
  
  # Configure Build Settings
  share_target.build_configurations.each do |config|
    config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.cookly.recipe.CooklyShare'
    config.build_settings['INFOPLIST_FILE'] = 'CooklyShare/Info.plist'
    config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'CooklyShare/CooklyShare.entitlements'
    config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
    config.build_settings['MARKETING_VERSION'] = '1.0'
    config.build_settings['CURRENT_PROJECT_VERSION'] = '1'
    config.build_settings['SWIFT_VERSION'] = '5.0'
    config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
    config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
    config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = [
      '$(inherited)',
      '@executable_path/Frameworks',
      '@executable_path/../../Frameworks'
    ]
    config.build_settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
    config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  end

  # Create CooklyShare group
  share_group = project.main_group.find_subpath('CooklyShare', true)
  share_group.set_source_tree('<group>')
  share_group.set_path('CooklyShare')

  # Add files
  view_controller_ref = share_group.new_file('ShareViewController.swift')
  share_target.source_build_phase.add_file_reference(view_controller_ref)

  info_plist_ref = share_group.new_file('Info.plist')
  entitlements_ref = share_group.new_file('CooklyShare.entitlements')

  # Add target dependency to App
  app_target.add_dependency(share_target)

  # Add Embed App Extensions copy phase to App
  embed_phase = app_target.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' || p.name == 'Embed App Extensions' }
  if embed_phase.nil?
    embed_phase = app_target.new_copy_files_build_phase('Embed App Extensions')
    embed_phase.dst_subfolder_spec = '13'
    embed_phase.dst_path = ''
  end

  build_file = embed_phase.add_file_reference(share_target.product_reference)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy', 'CodeSignOnCopy'] }

  project.save
  puts "CooklyShare extension successfully created and embedded in App!"
else
  puts "CooklyShare target already exists."
end
