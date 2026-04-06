function mkdir(path)
    os.execute('mkdir "' .. path .. '" 2>nul')
end

function exists(file)
   local ok, err, code = os.rename(file, file)
   if not ok then
      if code == 13 then
         return true
      end
   end
   return ok, err
end

function parent(path)
    if path:sub(-1) == "/" or path:sub(-1) == "\\" then
        return path:match("^(.*)[\\/][^\\/]+[\\/]?$")
    else
        return path:match("^(.*[\\/])")
    end
end

-- ############################################

local json = require('dkjson')
local r = reaper
local dir_path = os.getenv("TEMP") .. "\\rea-multiplayer"
local luajs_path = dir_path .. "\\luajs.json"
local jslua_path = dir_path .. "\\jslua.json"
local resourcePath = parent(r.GetProjectPath())
local fulldir = debug.getinfo(1, "S").source:match("^@(.*)[\\/][^\\/]+$")


local scan_media_params = {
    "B_MUTE", "B_MUTE_ACTUAL", "B_LOOPSRC", "B_ALLTAKESPLAY",
    "B_UISEL", "C_LOCK", "D_VOL", "D_POSITION", "D_LENGTH",
    "D_SNAPOFFSET", "D_FADEINLEN", "D_FADEOUTLEN", "D_FADEINDIR",
    "D_FADEOUTDIR", "I_GROUPID", "I_CUSTOMCOLOR", "I_CURTAKE",
    "F_FREEMODE_Y", "F_FREEMODE_H", "I_FIXEDLANE"
}

-- ############################################

function mp(path)
    if path:match("^[A-Za-z]:") then return path end

    return resourcePath .. '/' .. path
end

function mediaparams(media)
    local data = {}
    for _, param in ipairs(scan_media_params) do
        data[param] = r.GetMediaItemInfo_Value(media, param)
    end
    return data
end

function trackparams(track)
    local hasName, name = r.GetTrackName(track)
    local color = r.GetTrackColor(track)
    local cr, cg, cb = r.ColorFromNative(color)
    local hasColor = color ~= 0
    local _, icon = reaper.GetSetMediaTrackInfo_String(track, "P_ICON", "", false)
    local hasIcon = icon ~= ""
    if hasIcon then icon = mp(icon) end

    local medias = {}
    for media_index = 0, r.GetTrackNumMediaItems(track) - 1 do
        local media = r.GetTrackMediaItem(track, media_index)
        table.insert(medias, mediaparams(media))
    end


    return {
        nameData = {hasName = hasName, name = name},
        colorData = {hasColor = hasColor, r = cr, g = cg, b = cb},
        iconData = {hasIcon = hasIcon, icon = icon},
        medias = medias
    }
end

function scantracks()
    local amount = r.CountTracks(0)
    local tracks = {}
    for i = 0, amount - 1 do
        local track = r.GetTrack(0, i)
        table.insert(tracks, trackparams(track))
    end 

    return tracks
end


-- ############################################



function send()
    local file = io.open(luajs_path, "w")
    if file then
        local data = json.encode({project_path = r.GetProjectPath(), data = scantracks()})
        file:write(data)
        file:close()
    end
end

function setup()
    r.atexit(function ()
        r.ShowMessageBox("Script OFF", "Is_Running", 0)
    end)
    _G['script_running'] = not _G['script_running']
    r.ShowMessageBox("Script ON", "Is_Running", 0)
    if(not exists(dir_path)) then mkdir(dir_path) end
    os.execute('start /B /MIN "" "' .. fulldir .. '\\client.exe"')
    send()
    main()
end

function apply()
    local file = io.open(jslua_path, "r")
    if file then
        local data = json.decode(file:read("a"))
        
    end
end

-- ############################################

function main()
    if not _G['script_running'] then return end
    send()
    apply()
    r.defer(main)
end


-- ############################################

setup()