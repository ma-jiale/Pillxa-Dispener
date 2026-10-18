@echo off
setlocal
set "PROJECT_ROOT=%~dp0.."
set "CI=true"
set "FLUTTER_SUPPRESS_ANALYTICS=true"
set "DART_SUPPRESS_ANALYTICS=true"
set "PUB_CACHE=%PROJECT_ROOT%\.tools\pub-cache"
set "GRADLE_USER_HOME=%PROJECT_ROOT%\.tools\gradle"
set "ANDROID_USER_HOME=%PROJECT_ROOT%\.tools\android-user"
if not defined ANDROID_SDK_ROOT set "ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk"
set "ANDROID_HOME=%ANDROID_SDK_ROOT%"
if not defined JAVA_HOME set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
pushd "%PROJECT_ROOT%\apps\client"
call "%PROJECT_ROOT%\.tools\flutter\bin\flutter.bat" --suppress-analytics --no-version-check %*
set "RESULT=%ERRORLEVEL%"
popd
exit /b %RESULT%
