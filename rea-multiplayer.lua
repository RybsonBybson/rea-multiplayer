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

function table.contains(t, value)
    for _, v in ipairs(t) do
        if v == value then return true end
    end
    return false
end

-- ############################################

local json = require('dkjson')
local r = reaper
local dir_path = os.getenv("TEMP") .. "\\rea-multiplayer"
local luajs_path = dir_path .. "\\luajs.json"
local jslua_path = dir_path .. "\\jslua.json"
local resourcePath = parent(r.GetProjectPath())
local fulldir = debug.getinfo(1, "S").source:match("^@(.*)[\\/][^\\/]+$")
local _applying = false


local scan_media_params = {
    "B_MUTE", "B_MUTE_ACTUAL", "B_LOOPSRC", "B_ALLTAKESPLAY",
    "B_UISEL", "C_LOCK", "D_VOL", "D_POSITION", "D_LENGTH",
    "D_SNAPOFFSET", "D_FADEINLEN", "D_FADEOUTLEN", "D_FADEINDIR",
    "D_FADEOUTDIR", "I_GROUPID", "I_CUSTOMCOLOR", "I_CURTAKE",
    "F_FREEMODE_Y", "F_FREEMODE_H", "I_FIXEDLANE"
}
local scan_track_params = {
    "B_MUTE", "B_PHASE", "I_SOLO", "B_SOLO_DEFEAT",
    "I_FXEN", "I_RECARM", "I_RECINPUT", "I_RECMODE",
    "I_RECMODE_FLAGS", "I_RECMON", "I_RECMONITEMS",
    "B_AUTO_RECARM", "I_VUMODE", "I_AUTOMODE", "I_NCHAN",
    -- "I_SELECTED", 
    "I_FOLDERDEPTH", "I_FOLDERCOMPACT",
    "I_MIDIHWOUT", "I_MIDI_INPUT_CHANMAP", "I_MIDI_CTL_CHAN",
    "I_MIDI_TRACKSEL_FLAG", "I_PERFFLAGS", "I_CUSTOMCOLOR",
    "I_HEIGHTOVERRIDE", "I_SPACER", "B_HEIGHTLOCK",
    "D_VOL", "D_PAN", "D_WIDTH", "D_DUALPANL", "D_DUALPANR",
    "I_PANMODE", "D_PANLAW", "I_PANLAW_FLAGS",
    "B_SHOWINMIXER", "B_SHOWINTCP", "B_TCPPIN",
    "B_MAINSEND", "I_FREEMODE", "I_NUMFIXEDLANES",
    "C_BEATATTACHMODE", "I_PLAY_OFFSET_FLAG", "D_PLAY_OFFSET"
}
local scan_track_string_params = {
    "P_NAME", "P_ICON", "P_MCP_LAYOUT", "P_TCP_LAYOUT",
    "P_RAZOREDITS", "P_RAZOREDITS_EXT"
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
    data = {params = {}, string_params = {}}
    for _, param in ipairs(scan_track_params) do
        data.params[param] = r.GetMediaTrackInfo_Value(track, param)
    end
    for _, string_param in ipairs(scan_track_string_params) do
        data.string_params[string_param] = r.GetSetMediaTrackInfo_String(track, string_param, "", false)
    end

    local medias = {}
    for media_index = 0, r.GetTrackNumMediaItems(track) - 1 do
        local media = r.GetTrackMediaItem(track, media_index)
        table.insert(medias, mediaparams(media))
    end


    return {
        data = data,
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
        os.execute('taskkill /F /IM client.exe /T')
        r.ShowMessageBox("Script OFF", "Is_Running", 0)
    end)
    _G['script_running'] = not _G['script_running']
    r.ShowMessageBox("Script ON", "Is_Running", 0)
    if(not exists(dir_path)) then mkdir(dir_path) end
    os.execute('start /B /MIN "" "' .. fulldir .. '\\client.exe"')
    send()
    main()
end


function pathtypeof(path)
    if #path == 1 then return 'track' end
    if #path == 4 and table.contains(path, "data") then return path[2] end
    if table.contains(path, "medias") then return 'media' end
end

function applychange(change)
    
    local kind = change['kind']

    if kind == 'A' then r.InsertTrackInProject(0, change['index'], 1) return end
    
    local path = change['path']
    local tidx = path[1]
    local typeof = pathtypeof(path) -- 'track', 'params', 'string_params', 'media'
    local tr = r.GetTrack(0, tidx)

    if kind == 'E' and typeof == 'params' then r.SetMediaTrackInfo_Value(tr, path[3], change['rhs']) return end
    if kind == 'E' and typeof == 'string_params' then r.GetSetMediaTrackInfo_String(tr, path[3], change['rhs'], true) return end
end


function apply()
    local file = io.open(jslua_path, "r")
    if file then
        local data = json.decode(file:read("a"))
        file:close()
        if data and #data > 0 then
            _applying = true
            for _, change in ipairs(data) do
                applychange(change)
            end

            local clear = io.open(jslua_path, "w")
            if clear then clear:write("") clear:close() end
        end
    end
end

-- ############################################


function main()
    if not _G['script_running'] then return end
    if not _applying then
        send()
    else
        _applying = false
    end
    apply()
    r.defer(main)
end


-- ############################################

setup()