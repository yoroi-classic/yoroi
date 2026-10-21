cmake_minimum_required(VERSION 3.13)
set(CMAKE_VERBOSE_MAKEFILE on)

#don't rename it, react-native depends on it
project(appmodules)

#add_compile_options(
#        -fexceptions
#        -frtti
#        -std=c++20)

#set(CMAKE_CXX_STANDARD 20)
#set(CMAKE_CXX_STANDARD_REQUIRED ON)
#set(CMAKE_CXX_EXTENSIONS OFF)
#set(ANDROID_STL c++_shared)
#cd set(APP_STL c++_shared)


# Link against the C++ standard library
# set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} -static-libstdc++")
# set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -static-libstdc++")

# Find and link libc++

# Find package paths using npm
execute_process(
    COMMAND npm root
    OUTPUT_VARIABLE NODE_MODULES_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
)

# Get React Native path - choose the one closest relative to this CMakeLists.txt location
execute_process(
    COMMAND bash -c "npm ls react-native --parseable | python3 -c \"
import sys, os
current_dir = '${CMAKE_CURRENT_LIST_DIR}'
min_depth = float('inf')
closest_path = ''
for line in sys.stdin:
    path = line.strip()
    if path:
        try:
            rel_path = os.path.relpath(path, current_dir)
            depth = rel_path.count('../')
            if depth < min_depth:
                min_depth = depth
                closest_path = path
        except ValueError:
            pass
print(closest_path)
\""
    OUTPUT_VARIABLE RN_PATH
    OUTPUT_STRIP_TRAILING_WHITESPACE
)

# Get MSL Bridge path - choose the one closest relative to this CMakeLists.txt location
execute_process(
    COMMAND bash -c "npm ls @emurgo/msl-mobile-bridge-jsi --parseable | python3 -c \"
import sys, os
current_dir = '${CMAKE_CURRENT_LIST_DIR}'
min_depth = float('inf')
closest_path = ''
for line in sys.stdin:
    path = line.strip()
    if path:
        try:
            rel_path = os.path.relpath(path, current_dir)
            depth = rel_path.count('../')
            if depth < min_depth:
                min_depth = depth
                closest_path = path
        except ValueError:
            pass
print(closest_path)
\""
    OUTPUT_VARIABLE MSL_BRIDGE_PATH
    OUTPUT_STRIP_TRAILING_WHITESPACE
)

# Get CML Bridge path - choose the one closest relative to this CMakeLists.txt location
execute_process(
    COMMAND bash -c "npm ls @yoroi-classic/cml-mobile-bridge --parseable | python3 -c \"
import sys, os
current_dir = '${CMAKE_CURRENT_LIST_DIR}'
min_depth = float('inf')
closest_path = ''
for line in sys.stdin:
    path = line.strip()
    if path:
        try:
            rel_path = os.path.relpath(path, current_dir)
            depth = rel_path.count('../')
            if depth < min_depth:
                min_depth = depth
                closest_path = path
        except ValueError:
            pass
print(closest_path)
\""
    OUTPUT_VARIABLE CML_BRIDGE_PATH
    OUTPUT_STRIP_TRAILING_WHITESPACE
)

message(STATUS "NODE_MODULES_DIR: ${NODE_MODULES_DIR}")
message(STATUS "RN_PATH: ${RN_PATH}")
message(STATUS "MSL_BRIDGE_PATH: ${MSL_BRIDGE_PATH}")
message(STATUS "CML_BRIDGE_PATH: ${CML_BRIDGE_PATH}")

if (NOT EXISTS ${RN_PATH})
    message(FATAL_ERROR "Can't find React Native. Please run npm install in the root of your project directory")
endif()

if (NOT EXISTS ${MSL_BRIDGE_PATH})
    message(FATAL_ERROR "Can't find @emurgo/msl-mobile-bridge-jsi. Please run npm install in the root of your project directory")
endif()

if (NOT EXISTS "${CML_BRIDGE_PATH}/android/CMakeLists.txt")
    message(FATAL_ERROR "Can't find @yoroi-classic/cml-mobile-bridge Android CMake project. Please run npm install in the root of your project directory")
endif()

set(CPP_DIR ${CMAKE_CURRENT_LIST_DIR}/../../../../../cpp)
message(STATUS "CPP_DIR: ${CPP_DIR}")

if (NOT EXISTS ${CPP_DIR})
    message(FATAL_ERROR "Can't find C++ source directory. Please check the path: ${CPP_DIR}")
endif()

file(GLOB cxx_modules_loader_SRC CONFIGURE_DEPENDS ${CPP_DIR}/*.cpp)
add_library(cxx_modules_loader STATIC ${cxx_modules_loader_SRC})

include_directories(
    ${CPP_DIR}
#    ${RN_PATH}/ReactCommon
#    ${RN_PATH}/ReactCommon/jsi
)

include(${RN_PATH}/ReactAndroid/cmake-utils/ReactNative-application.cmake)
include(${MSL_BRIDGE_PATH}/emurgo-msl-mobile-bridge.cmake)

target_include_directories(cxx_modules_loader PRIVATE
        ${CML_BRIDGE_PATH}/cpp
        ${CML_BRIDGE_PATH}/android/build/generated/source/codegen/jni)

target_link_libraries(cxx_modules_loader
        jsi
        msl_mobile_bridge_jsi
        cml_mobile_bridge_jsi)


target_link_libraries(${CMAKE_PROJECT_NAME} cxx_modules_loader)
