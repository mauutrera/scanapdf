<?php
/**
 * Control segmentado (grupo de radios).
 * @var string $name
 * @var array<string,string> $options valor => etiqueta (ojo: PHP convierte claves como '1' en enteros)
 * @var string $checked
 * @var string $legend
 * @var string $idPrefix  prefijo de los ids (cada sección usa el suyo: conviven en la misma página al navegar sin recargar)
 */
$idBase = (isset($idPrefix) && $idPrefix !== '' ? $idPrefix . '-' : '') . $name;
?>
<fieldset class="space-y-2">
    <legend class="label"><?= e($legend) ?></legend>
    <div class="seg">
        <?php foreach ($options as $value => $label): ?>
            <label class="seg-option">
                <input type="radio" class="sr-only" id="<?= e($idBase . '-' . $value) ?>" name="<?= e($name) ?>" value="<?= e($value) ?>" <?= (string) $value === (string) $checked ? 'checked' : '' ?>>
                <span><?= e($label) ?></span>
            </label>
        <?php endforeach; ?>
    </div>
</fieldset>
