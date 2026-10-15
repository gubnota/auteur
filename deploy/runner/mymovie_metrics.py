"""Bounded read-only metrics, no dependencies and no credentials in output."""
import json, os, platform, subprocess, time
from pathlib import Path

def command(args):
    return subprocess.check_output(args, text=True, timeout=2, stderr=subprocess.DEVNULL).strip()

result={'sampledAt':int(time.time()),'cpuPercent':None,'ramUsedBytes':None,'ramTotalBytes':None,'gpus':[], 'memoryKind':'RAM'}
try:
    if platform.system()=='Linux':
        def counters():
            row=[int(v) for v in Path('/proc/stat').read_text().splitlines()[0].split()[1:]]
            return sum(row),row[3]+(row[4] if len(row)>4 else 0)
        total,idle=counters();time.sleep(.15);next_total,next_idle=counters()
        if next_total>total: result['cpuPercent']=round(100*(1-(next_idle-idle)/(next_total-total)),1)
        memory={key:int(value.split()[0])*1024 for key,value in (row.split(':',1) for row in Path('/proc/meminfo').read_text().splitlines())}
        result.update(ramTotalBytes=memory['MemTotal'],ramUsedBytes=memory['MemTotal']-memory.get('MemAvailable',memory.get('MemFree',0)))
    elif platform.system()=='Darwin':
        total=int(command(['/usr/sbin/sysctl','-n','hw.memsize']))
        # vm_stat free + inactive + speculative are reclaimable. Label as unified memory.
        import re
        vm=command(['/usr/bin/vm_stat']);page=int(re.search(r'page size of (\d+)',vm).group(1))
        pages={k.strip():int(v.strip().rstrip('.')) for k,v in (line.split(':',1) for line in vm.splitlines()[1:] if ':' in line)}
        available=sum(pages.get(k,0) for k in ['Pages free','Pages inactive','Pages speculative'])*page
        cpu=sum(float(v) for v in command(['/bin/ps','-A','-o','%cpu=']).split())/(os.cpu_count() or 1)
        result.update(cpuPercent=round(min(100,cpu),1),ramTotalBytes=total,ramUsedBytes=max(0,total-available),memoryKind='Apple unified memory')
except Exception:
    pass
try:
    rows=command(['nvidia-smi','--query-gpu=index,name,utilization.gpu,memory.used,memory.total','--format=csv,noheader,nounits'])
    for row in rows.splitlines()[:16]:
        index,name,util,used,total=[v.strip() for v in row.split(',')]
        result['gpus'].append({'index':int(index),'name':name,'percent':float(util),'usedBytes':int(used)*1048576,'totalBytes':int(total)*1048576})
except Exception:
    pass
print(json.dumps(result))
