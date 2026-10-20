// Grupo de workers (hilos): reparte los trabajos entre varios workers y los ejecuta en paralelo.
// Cada trabajo es un mensaje {id, ...datos}; el worker responde {id, ...resultado} o {id, error}.

/** Hilos a usar: uno por núcleo, dejando uno libre para la interfaz (entre 2 y 6). */
export const THREADS = Math.min(6, Math.max(2, (navigator.hardwareConcurrency || 4) - 1));

export class WorkerPool {
  /**
   * @param {URL} url   script del worker (módulo)
   * @param {number} size  máximo de workers simultáneos
   */
  constructor(url, size = THREADS) {
    this.url = url;
    this.size = size;
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.jobs = new Map();
    this.nextId = 1;
  }

  /**
   * Encola un trabajo. Los workers se crean al primer uso (no consumen memoria si no se necesitan).
   * @param {object} payload
   * @param {Transferable[]} [transfer]  objetos que se mueven al worker sin copiarse (ImageBitmap, buffers)
   * @returns {Promise<object>}
   */
  run(payload, transfer = []) {
    return new Promise((resolve, reject) => {
      this.queue.push({ payload, transfer, resolve, reject });
      this.pump();
    });
  }

  pump() {
    while (this.queue.length) {
      let worker = this.idle.pop();
      if (!worker) {
        if (this.workers.length >= this.size) return;
        worker = this.spawn();
      }
      const job = this.queue.shift();
      const id = this.nextId++;
      this.jobs.set(id, job);
      worker.jobId = id;
      worker.postMessage({ id, ...job.payload }, job.transfer);
    }
  }

  spawn() {
    const worker = new Worker(this.url, { type: 'module' });
    worker.onmessage = ({ data }) => {
      const job = this.jobs.get(data.id);
      this.jobs.delete(data.id);
      worker.jobId = 0;
      this.idle.push(worker);
      if (job) {
        if (data.error) job.reject(new Error(data.error));
        else job.resolve(data);
      }
      this.pump();
    };
    worker.onerror = (e) => {
      // El worker se cayó (p. ej. sin memoria): se descarta, su trabajo falla y los demás siguen.
      e.preventDefault?.();
      const job = this.jobs.get(worker.jobId);
      this.jobs.delete(worker.jobId);
      job?.reject(new Error(e.message || 'Un proceso en segundo plano se detuvo.'));
      worker.terminate();
      this.workers = this.workers.filter((w) => w !== worker);
      this.idle = this.idle.filter((w) => w !== worker);
      this.pump();
    };
    this.workers.push(worker);
    return worker;
  }
}
