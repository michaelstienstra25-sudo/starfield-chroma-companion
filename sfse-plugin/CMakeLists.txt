cmake_minimum_required(VERSION 3.24)
project(StarfieldChromaCodex LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(SFSE_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../work/sfse" CACHE PATH "Path to cloned SFSE source")

add_library(StarfieldChromaCodex SHARED
    src/plugin.cpp
    "${SFSE_ROOT}/sfse_common/Relocation.cpp"
)

target_include_directories(StarfieldChromaCodex PRIVATE
    "${SFSE_ROOT}"
)

target_compile_definitions(StarfieldChromaCodex PRIVATE
    WIN32_LEAN_AND_MEAN
    NOMINMAX
)

target_link_libraries(StarfieldChromaCodex PRIVATE ws2_32)

set_target_properties(StarfieldChromaCodex PROPERTIES
    OUTPUT_NAME "StarfieldChromaCodex"
)
