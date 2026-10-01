import math, sys
from PIL import Image, ImageDraw
# Aufruf: python icon.py <Zielordner> [Hintergrundfarbe] [Farbe des Objektivs], beide als Hex ohne #
# Weiß gefüllte Kamera, die Uhr als Objektiv ist innen farbig.
# Normale App: python icon.py app 455a6f c2570c   Test-App: python icon.py test c2570c
BG=tuple(bytes.fromhex(sys.argv[2])) if len(sys.argv)>2 else (17,32,62); FG=(255,255,255)
LENS=tuple(bytes.fromhex(sys.argv[3])) if len(sys.argv)>3 else BG
S=4; N=512*S
SC=0.84                      # Größe der ganzen Kamera gegenüber dem Entwurf
OX,OY=256,259                # Mitte der Kamera im Entwurf, landet genau in der Bildmitte
def X(v): return int(round((256+(v-OX)*SC)*S))
def Y(v): return int(round((256+(v-OY)*SC)*S))
def L(v): return int(round(v*SC*S))
img=Image.new('RGB',(N,N),BG); d=ImageDraw.Draw(img)
# Gehäuse und Sucherhöcker, beide mit runden Ecken
bx0,by0,bx1,by1=100,170,412,390; br=44
hx0,hy0,hx1=170,124,306; hr=22
d.rounded_rectangle([X(bx0),Y(by0),X(bx1),Y(by1)],L(br),fill=FG)
d.rounded_rectangle([X(hx0),Y(hy0),X(hx1),Y(by0+40)],L(hr),fill=FG)
# Weiche Übergänge zwischen Höcker und Gehäuse statt spitzer Innenecken
f=16
d.rectangle([X(hx0-f),Y(by0-f),X(hx0),Y(by0)],fill=FG)
d.ellipse([X(hx0-2*f),Y(by0-2*f),X(hx0),Y(by0)],fill=BG)
d.rectangle([X(hx1),Y(by0-f),X(hx1+f),Y(by0)],fill=FG)
d.ellipse([X(hx1),Y(by0-2*f),X(hx1+2*f),Y(by0)],fill=BG)
# Blitz als Punkt oben rechts
d.ellipse([X(356-12),Y(214-12),X(356+12),Y(214+12)],fill=BG)
# Uhr als Objektiv, innen farbig mit weißem Ring und weißen Zeigern
cx,cy=256,284; R=86
d.ellipse([X(cx-R),Y(cy-R),X(cx+R),Y(cy+R)],fill=LENS)
rr=R-16; rw=9
d.ellipse([X(cx-rr),Y(cy-rr),X(cx+rr),Y(cy+rr)],outline=FG,width=L(rw))
def hand(x2,y2,w):
    d.line([X(cx),Y(cy),X(x2),Y(y2)],fill=FG,width=L(w))
    for x,y in((cx,cy),(x2,y2)):
        d.ellipse([X(x-w/2),Y(y-w/2),X(x+w/2),Y(y+w/2)],fill=FG)
hand(cx,cy-44,13)
a=math.radians(30); hand(cx+34*math.cos(a),cy+34*math.sin(a),13)
out=sys.argv[1]
for size in (512,192):
    img.resize((size,size),Image.LANCZOS).save(f'{out}/icon-{size}.png',optimize=True)
