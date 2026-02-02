cmake_minimum_required(VERSION 3.10.2)

project(edge_processor)

set(CMAKE_CXX_STANDARD 17)

# Find OpenCV package provided by OpenCV Android AAR (opencv_java4)
find_package(OpenCV REQUIRED COMPONENTS core imgproc imgcodecs imgproc)

add_library(edge_processor SHARED
    edge_processor.cpp
)

include_directories(${OpenCV_INCLUDE_DIRS})

target_link_libraries(edge_processor
    ${OpenCV_LIBS}
    log
)
