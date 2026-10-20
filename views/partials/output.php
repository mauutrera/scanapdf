<?php
/**
 * Ajustes de salida comunes (limpieza, estilo, apariencia) y botones de exportación.
 * @var string $prefix     prefijo de los ids: doc | cred
 * @var string $cleanLabel texto de la opción de limpieza
 * @var string $cleanHelp
 */
?>
<label class="flex cursor-pointer items-start gap-3">
    <input type="checkbox" id="<?= e($prefix) ?>-clean" name="clean" class="mt-1 h-4 w-4 accent-lamp-600" checked>
    <span>
        <span class="block text-sm font-medium"><?= e($cleanLabel) ?></span>
        <span class="hint block"><?= e($cleanHelp) ?></span>
    </span>
</label>

<?= partial('seg', ['idPrefix' => $prefix, 'legend' => 'Color', 'name' => 'style', 'checked' => 'color',
    'options' => ['color' => 'Color', 'gray' => 'Grises', 'bw' => 'B/N']]) ?>

<?= partial('seg', ['idPrefix' => $prefix, 'legend' => 'Apariencia', 'name' => 'look', 'checked' => 'scan',
    'options' => ['scan' => 'Escaneado', 'clean' => 'Digital limpio']]) ?>

<div class="space-y-2 border-t border-ink-200 pt-5 dark:border-ink-800">
    <div class="flex gap-2">
        <button type="button" id="<?= e($prefix) ?>-export-pdf" class="btn btn-primary flex-1" disabled>Descargar PDF</button>
        <button type="button" id="<?= e($prefix) ?>-export-jpg" class="btn btn-ghost" disabled>JPG</button>
    </div>
    <p id="<?= e($prefix) ?>-export-hint" class="hint text-center"></p>
</div>
