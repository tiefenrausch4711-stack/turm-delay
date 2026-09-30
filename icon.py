import math, sys
from PIL import Image, ImageDraw
BG=(17,32,62); FG=(255,255,255)
S=4; N=512*S
def k(v): return int(round(v*S))
img=Image.new('RGB',(N,N),BG); d=ImageDraw.Draw(img)
sw=20  # Strichstärke
# Kameragehäuse und Sucherhöcker, zuerst weiß gefüllt, dann innen ausgespart
bx0,by0,bx1,by1=100,170,412,390; br=40
hx0,hy0,hx1,hy1=176,128,300,180; hr=16
d.rounded_rectangle([k(bx0),k(by0),k(bx1),k(by1)],k(br),fill=FG)
d.rounded_rectangle([k(hx0),k(hy0),k(hx1),k(hy1+30)],k(hr),fill=FG)
d.rounded_rectangle([k(bx0+sw),k(by0+sw),k(bx1-sw),k(by1-sw)],k(br-sw),fill=BG)
d.rounded_rectangle([k(hx0+sw),k(hy0+sw),k(hx1-sw),k(by0+sw+10)],k(max(hr-sw,2)),fill=BG)
# Blitz als Punkt oben rechts
d.ellipse([k(352-11),k(214-11),k(352+11),k(214+11)],fill=FG)
# Uhr als Objektiv
cx,cy=256,284; R=78; cs=16
d.ellipse([k(cx-R),k(cy-R),k(cx+R),k(cy+R)],fill=FG)
d.ellipse([k(cx-R+cs),k(cy-R+cs),k(cx+R-cs),k(cy+R-cs)],fill=BG)
def hand(x2,y2,w):
    d.line([k(cx),k(cy),k(x2),k(y2)],fill=FG,width=k(w))
    for x,y in((cx,cy),(x2,y2)):
        d.ellipse([k(x-w/2),k(y-w/2),k(x+w/2),k(y+w/2)],fill=FG)
hand(cx,cy-46,14)
a=math.radians(30); hand(cx+38*math.cos(a),cy+38*math.sin(a),14)
out=sys.argv[1]
for size in (512,192):
    img.resize((size,size),Image.LANCZOS).save(f'{out}/icon-{size}.png',optimize=True)
