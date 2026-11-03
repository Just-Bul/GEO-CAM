Pod::Spec.new do |s|
  s.name           = 'VideoStamping'
  s.version        = '1.0.0'
  s.summary        = 'Burns Geo Camera location stamps into videos with AVFoundation.'
  s.description    = 'Local Expo module used by Geo Camera to composite pre-rendered stamp images onto recorded videos.'
  s.author         = 'Rakibul Islam'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = 'MIT'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'CoreImage', 'CoreMedia'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
