# Conventions du projet

Ces règles viennent du code existant. Les enfreindre casse l'équivalence que
le portage doit démontrer.

## Les montants

**Aucun montant ne transite en flottant.** Entiers de centimes d'ariary, du
parseur jusqu'à l'affichage.

Le piège concret : `(float)"0.29" * 100` vaut `28.999999999999996`. Tronqué,
cela fait **28 centimes au lieu de 29**. Idem `"1.15"` → 114, `"4.35"` → 434,
`"8.20"` → 819.

Ce qui rend le piège dangereux : la majorité des valeurs passent très bien —
`"28166.67" * 100` vaut exactement `2816667`. Tester au hasard donne
l'impression que la précaution est inutile. Un test verrouille les deux côtés :
il prouve d'abord que le piège existe, ensuite que le parseur y échappe.

On découpe la chaîne, on ne multiplie jamais.

Quantités : entiers de **millièmes** d'unité, pour la même raison.

## L'encodage

L'export a été relu en **Windows-1252**, pas en Latin-1 : dans la plage
`0x80-0x9F` les deux divergent complètement. La table inverse est ce qui décide
de la réussite de la réparation.

La réparation est **locale, séquence par séquence**. Une chaîne peut être
partiellement abîmée — « décharge agréée CO² » où les accents sont déjà
corrects et seul l'exposant est déguisé. Décoder la chaîne entière d'un bloc
détruirait la partie saine.

Perte irréversible (`?` ou caractère de remplacement) : on signale, on
n'invente pas.

**Les cas de test se fabriquent, ne se recopient pas.** `fabriquerMojibake()`
produit le dégât à partir du libellé correct, et le test vérifie l'aller-retour.
Recopier une chaîne abîmée à la main suffit à transformer une espace insécable
en espace ordinaire — le cas ne teste alors plus rien tout en paraissant valide.
C'est arrivé pendant le portage.

## Les bibliothèques de formatage sont écartées

`Intl.NumberFormat` a été rejeté côté TypeScript : selon la version d'ICU il
produit une espace insécable ou fine insécable, qui cassent les exports CSV et
s'affichent en carré dans certains PDF. `NumberFormatter` et `Normalizer` de
l'extension `intl` sont écartés côté PHP pour la même raison, plus une
seconde : `intl` n'est pas garantie sur l'hébergement.

Groupement des milliers et dépouillement des accents se font par table
explicite. Même résultat sur toutes les machines.

## La confiance

**Le serveur ne croit jamais le navigateur sur les montants.** L'écran affiche
un total pour informer ; le total qui fait foi est recalculé à l'enregistrement.

**Les lignes de document portent des copies** figées à l'ajout.

**Un document finalisé est figé.** Pour le corriger, on l'annule et on en crée
un autre.

## Nommage et commentaires

Le code est en **français** : `parseMontant`, `nettoyerLibelle`,
`classerEchelle`, `sousTotal`. Le portage conserve les mêmes noms — c'est ce
qui rend les deux implémentations comparables à la lecture.

Les commentaires sont **sans accents** dans le code, accentués dans les
documents. Ils expliquent **pourquoi**, pas quoi : la densité du code existant
est la référence.

## Les tests

Un module n'est porté que lorsque ses tests passent **et** que le différentiel
sur l'export réel ne montre aucune divergence.
