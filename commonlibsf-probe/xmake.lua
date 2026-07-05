set_xmakever("3.0.0")

set_project("starfield-chroma-probe")
set_version("0.1.0")
set_arch("x64")
set_languages("c++23")
set_encodings("utf-8")

add_rules("mode.releasedbg", "mode.debug")

local commonlibsf_root = os.getenv("COMMONLIBSF_ROOT") or "../commonlibsf"
includes(commonlibsf_root)

target("StarfieldChromaProbe", function()
    add_rules("commonlibsf.plugin", {
        name = "Starfield Chroma Probe",
        author = "Codex",
        description = "CommonLibSF event probe for Starfield Chroma Codex",
        options = {
            address_library = true,
            layout_dependent = true,
            sig_scanning = false,
            no_struct_use = false
        }
    })

    set_kind("shared")
    set_license("GPL-3.0-or-later")
    set_version("0.1.0")
    add_files("src/*.cpp")
    add_syslinks("ws2_32")
end)
