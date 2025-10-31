import { join } from "path";
import * as fs from "fs";
import { DOMParser, XMLSerializer } from "xmldom";

interface PlacemarkData {
  plotname: string;
  placemark: Element;
  parentKey: string;
}

interface DuplicateEntry {
  name: string;
  count: number;
  corrected: string[];
}

type DuplicatesReport = Record<string, DuplicateEntry[]>;

function createParentKey(
  parentAttributes: string[],
  placemark: Element
): string | null {
  const values: string[] = [];

  for (const attrName of parentAttributes) {
    const element = Array.from(
      placemark.getElementsByTagName("SimpleData")
    ).find((el) => el.getAttribute("name") === attrName);
    const value = element ? element.textContent?.trim() : null;

    if (!value) {
      return null;
    }
    values.push(value);
  }

  return values.join("|");
}

function processAndFixKML(
  filePath: string,
  outputFilePath: string,
  parentAttributes: string[]
): DuplicatesReport {
  try {
    const kmlContent = fs.readFileSync(filePath, "utf-8");
    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    const xmlDoc = parser.parseFromString(kmlContent, "text/xml");
    const placemarks = xmlDoc.getElementsByTagName("Placemark");

    const parentGroups: Record<string, PlacemarkData[]> = {};
    const duplicates: DuplicatesReport = {};
    let totalDuplicates = 0;

    for (let i = 0; i < placemarks.length; i++) {
      const placemark = placemarks[i];

      const plotnameElement = Array.from(
        placemark.getElementsByTagName("SimpleData")
      ).find(
        (el) =>
          el.getAttribute("name") ===
          parentAttributes[parentAttributes.length - 1]
      );
      const plotname = plotnameElement
        ? plotnameElement.textContent?.trim()
        : null;

      if (!plotname) continue;

      const parentKey = createParentKey(parentAttributes, placemark);
      if (!parentKey) continue;

      if (!parentGroups[parentKey]) {
        parentGroups[parentKey] = [];
      }
      parentGroups[parentKey].push({ plotname, placemark, parentKey });
    }

    for (const parentKey in parentGroups) {
      const plots = parentGroups[parentKey];
      const plotCounts: Record<string, number> = {};
      const duplicateEntries: DuplicateEntry[] = [];
      const modifiedNames: Record<string, string[]> = {};

      plots.forEach(({ plotname }) => {
        plotCounts[plotname] = (plotCounts[plotname] || 0) + 1;
      });

      const nameTracker: Record<string, number> = {};

      plots.forEach(({ plotname, placemark }) => {
        if (plotCounts[plotname] > 1) {
          if (!nameTracker[plotname]) {
            nameTracker[plotname] = 0;
          }
          nameTracker[plotname]++;

          const newPlotName = `${plotname} - ${nameTracker[plotname]}`;

          const plotnameElement = Array.from(
            placemark.getElementsByTagName("SimpleData")
          ).find(
            (el) =>
              el.getAttribute("name") ===
              parentAttributes[parentAttributes.length - 1]
          );

          if (plotnameElement) {
            plotnameElement.textContent = newPlotName;

            if (!modifiedNames[plotname]) {
              modifiedNames[plotname] = [];
            }
            modifiedNames[plotname].push(newPlotName);
          }
        }
      });

      for (const plotname in plotCounts) {
        if (plotCounts[plotname] > 1) {
          duplicateEntries.push({
            name: plotname,
            count: plotCounts[plotname],
            corrected: modifiedNames[plotname] || [],
          });
          totalDuplicates++;
        }
      }

      if (duplicateEntries.length > 0) {
        duplicates[parentKey] = duplicateEntries;
      }
    }

    const correctedKML = serializer.serializeToString(xmlDoc);
    fs.mkdirSync(outputFilePath, { recursive: true });
    fs.writeFileSync(
      join(outputFilePath, filePath.split(".")[0] + " - Corrigido.kml"),
      correctedKML,
      "utf-8"
    );

    console.log(
      "Talhões duplicados por grupo de atributos pais:",
      JSON.stringify(duplicates, null, 2)
    );

    console.log(
      `Total de talhões com nomes repetidos corrigidos: ${totalDuplicates}`
    );

    return duplicates;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Erro ao processar o arquivo KML:", errorMessage);
    return {};
  }
}

const filePath = "1.kml";
const outputFilePath = "./output";
// Passar mais de um atributo para identificar os duplicados ["farmname", "zonename"]
const parentAttributes = ["NOME_FAZ", "ZONA", "TALHAO"];

processAndFixKML(filePath, outputFilePath, parentAttributes);
