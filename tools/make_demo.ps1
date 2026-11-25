<#
  Builds docs/demo.mp4 from a phone recording of the TV:
  HDR (HLG) -> SDR tone mapping, perspective correction to the TV screen, cut to the chosen clips.
  Usage: powershell -File tools\make_demo.ps1 -Source C:\path\IMG_0802.MOV
#>
param([string]$Source = "$env:USERPROFILE\Downloads\IMG_0802.MOV")
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'docs\demo.mp4'

# screen corners in the recording (top-left, top-right, bottom-left, bottom-right)
$persp = 'perspective=x0=367:y0=37:x1=1616:y1=64:x2=326:y2=765:x3=1643:y3=776:interpolation=cubic'
$tone = 'zscale=tin=arib-std-b67:min=bt2020nc:pin=bt2020:rin=tv:t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p'
$look = 'eq=contrast=1.06:saturation=1.12:brightness=0.02'

# clips to keep (seconds): app home, trailer preview, movies, details, browsing, series, channel, player
$clips = @(
  @(11.0, 23.5), @(24.0, 34.5), @(75.0, 82.5), @(83.0, 94.5), @(109.0, 115.8), @(120.0, 123.8),
  @(125.0, 129.8), @(131.0, 136.8), @(140.0, 144.8), @(152.0, 155.8), @(157.0, 167.8), @(194.0, 213.5)
)
$inputs = @(); $chains = @(); $labels = ''
for ($i = 0; $i -lt $clips.Count; $i++) {
  $inputs += @('-ss', $clips[$i][0], '-to', $clips[$i][1], '-i', $Source)
  $chains += "[${i}:v]$tone,$persp,scale=1920:1080:flags=lanczos,setsar=1,fps=30,$look,setpts=PTS-STARTPTS[v$i]"
  $labels += "[v$i]"
}
$total = ($clips | ForEach-Object { $_[1] - $_[0] } | Measure-Object -Sum).Sum
$fc = ($chains -join ';') + ";${labels}concat=n=$($clips.Count):v=1:a=0,fade=t=in:st=0:d=0.6,fade=t=out:st=$($total - 0.8):d=0.8[out]"
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
& ffmpeg -hide_banner -loglevel error -stats -y @inputs -filter_complex $fc -map '[out]' -an `
  -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart $out
"{0}: {1:N1} s, {2:N1} MB" -f $out, $total, ((Get-Item $out).Length / 1MB)
