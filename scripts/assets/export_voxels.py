"""Render original RA2 VXL/HVA models to 32 directional PNG frames.
The original voxel colors, geometry and HVA transforms are preserved. Offline orthographic
rasterization uses a surface-derived light approximation rather than proprietary engine code.
"""
import sys,struct,math,json
from pathlib import Path
from PIL import Image,ImageDraw
import export_assets as e

def decode(name):
 b=e.M['local'].get(name+'.vxl')
 if not b:return []
 n=struct.unpack_from('<I',b,20)[0];body=802+28*n;size=struct.unpack_from('<I',b,28)[0];points=[]
 hva=e.M['local'].get(name+'.hva')
 for li in range(n):
  t=body+size+li*92;starts,ends,data=struct.unpack_from('<3I',b,t);scale=struct.unpack_from('<f',b,t+12)[0]
  matrix=list(struct.unpack_from('<12f',b,t+16));bounds=struct.unpack_from('<6f',b,t+64);X,Y,Z=b[t+88:t+91]
  if hva:
   sections=struct.unpack_from('<I',hva,20)[0]
   if li<sections:
    hm=struct.unpack_from('<12f',hva,24+sections*16+li*48)
    for k in range(12):matrix[k]=hm[k]
    # HVA translations use the same coordinate units as the VXL bounds.
  vox={}
  for y in range(Y):
   for x in range(X):
    off=struct.unpack_from('<I',b,body+starts+4*(y*X+x))[0]
    if off==0xffffffff:continue
    end=struct.unpack_from('<I',b,body+ends+4*(y*X+x))[0];p=body+data+off;limit=body+data+end;z=0
    while p<=limit and z<Z:
     skip,count=b[p:p+2];p+=2;z+=skip
     for _ in range(count):
      color,normal=b[p:p+2];p+=2
      vox[(x,y,z)]=(color,normal);z+=1
     p+=1
  for (x,y,z),(color,normal) in vox.items():
   xx=bounds[0]+(x+.5)*(bounds[3]-bounds[0])/X
   yy=bounds[1]+(y+.5)*(bounds[4]-bounds[1])/Y
   zz=bounds[2]+(z+.5)*(bounds[5]-bounds[2])/Z
   px=matrix[0]*xx+matrix[1]*yy+matrix[2]*zz+matrix[3]
   py=matrix[4]*xx+matrix[5]*yy+matrix[6]*zz+matrix[7]
   pz=matrix[8]*xx+matrix[9]*yy+matrix[10]*zz+matrix[11]
   nx=(int((x-1,y,z) in vox)-int((x+1,y,z) in vox));ny=(int((x,y-1,z) in vox)-int((x,y+1,z) in vox));nz=(int((x,y,z-1) in vox)-int((x,y,z+1) in vox))
   points.append((px,py,pz,color,nx,ny,nz))
 return points

def export(name,raw=None,parts=None,pal=None):
 raw=raw or name;points=[];files=[]
 for part in (parts or [raw,raw+'tur',raw+'barl']):
  ps=decode(part)
  if ps:points.extend(ps);files.append(part+'.vxl')
 if not points:return False
 pal=pal or e.palette('unittem');N=32;S=200 if raw in ['zep','dred','carrier','gtgcantur'] else 128;W=H=S;cols=8;sheet=Image.new('RGBA',(W*cols,H*4));maskSheet=Image.new('RGBA',sheet.size)
 for frame in range(N):
  a=frame*math.tau/N;ca,sa=math.cos(a),math.sin(a);render=[]
  for x,y,z,c,nx,ny,nz in points:
   xr=x*ca-y*sa;yr=x*sa+y*ca
   sx=W/2+(xr-yr)*.707106;sy=H/2+(xr+yr)*.353553-z*.866025
   depth=(xr+yr)*.612372+z*.5
   # Ambient + directional surface light derived from original voxel occupancy.
   light=1.0 if nx==ny==nz==0 else max(.55,min(1.15,.85+.17*nz-.13*(nx*ca-ny*sa)-.07*(nx*sa+ny*ca)))
   rgb=tuple(min(255,int(pal[c*3+k]*light)) for k in range(3));render.append((depth,sx,sy,c,rgb))
  render.sort(key=lambda p:p[0]);im=Image.new('RGBA',(W,H));mask=Image.new('RGBA',(W,H));d=ImageDraw.Draw(im);dm=ImageDraw.Draw(mask)
  for _,sx,sy,c,rgb in render:
   box=[int(sx),int(sy),int(sx)+1,int(sy)+1];d.rectangle(box,fill=(*rgb,255));dm.rectangle(box,fill=(255,255,255,max(rgb)) if 16<=c<=31 else (0,0,0,0))
  sheet.paste(im,((frame%cols)*W,(frame//cols)*H));maskSheet.paste(mask,((frame%cols)*W,(frame//cols)*H))
 out=e.OUT/'sprites';out.mkdir(exist_ok=True);sheet.save(out/(name+'.png'));maskSheet.save(out/(name+'-remap.png'))
 e.manifest['sprites'][name]={'src':'/assets/sprites/'+name+'.png','width':sheet.width,'height':sheet.height,'frameWidth':W,'frameHeight':H,'frames':32,'columns':cols,'anchorX':W/2,'anchorY':H/2,'originalFile':','.join(files),'format':'VXL','remapMaskSrc':'/assets/sprites/'+name+'-remap.png','facings':32,'facingConvention':'world-xy'};return True
def main():
 e.manifest=json.loads((e.OUT/'manifest.json').read_text())
 for name,raw in [('gtnk','gtnk'),('htnk','htnk'),('cmin','cmin'),('harv','harv'),('mcv','mcv'),('smcv','smcv'),('fv','fv'),('htk','htk'),('sref','sref'),('rtnk','rtnk'),('mtnk','mtnk'),('v3','v3'),('tnkd','tnkd'),('ttnk','ttnk'),('trucka','trucka'),('falc','falc'),('beag','beag'),('zep','zep'),('shad','shad'),('dest','dest'),('aegis','aegis'),('carrier','carrier'),('sub','sub'),('hyd','hyd'),('dred','dred'),('lcrf','lcrf'),('trs','trs')]:
  print(name,export(name,raw),flush=True)
 # Passenger roles change the IFV's original turret model; retain all six shapes.
 for index in range(6):
  turret='fvtur'+(str(index) if index else '');export('fv-shape'+str(index),'fv',parts=['fv',turret])
  if index<4:e.manifest['sprites']['fv-turret'+str(index)]=dict(e.manifest['sprites']['fv-shape'+str(index)])
 (e.OUT/'manifest.json').write_text(json.dumps(e.manifest,indent=2))

if __name__=='__main__':main()
