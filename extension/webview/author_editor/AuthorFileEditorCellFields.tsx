import { useAuthorFileEditorCellFind } from "./AuthorFileEditorCell";
import "./AuthorFileEditorCellFields.css";

export interface AuthorFileEditorCellField {
    attributeName: string;
    label: string;
    placeholder?: string;
    isCheckbox?: boolean;
}

interface AuthorFileEditorCellFieldsProps {
    fields: AuthorFileEditorCellField[];
    cellAttributes: Record<string, string>;
    onAttributeChanged: (attributeName: string, attributeValue: string) => void;
}

export function AuthorFileEditorCellFields({
    fields,
    cellAttributes,
    onAttributeChanged,
}: AuthorFileEditorCellFieldsProps) {
    const { matches, current } = useAuthorFileEditorCellFind();

    // A title is a box, and a box cannot hold a mark around part of what it
    // says, so the whole of it is marked instead.
    function inputClassName(attributeName: string): string {
        return [
            "author-file-editor-cell-field-input",
            matches.some((match) => match.attributeName === attributeName)
                ? "author-file-editor-find-field"
                : "",
            current?.attributeName === attributeName
                ? "author-file-editor-find-field-current"
                : "",
        ]
            .filter((className) => className !== "")
            .join(" ");
    }

    return (
        <div className="author-file-editor-cell-fields">
            {fields.map((field) => (
                <label
                    className="author-file-editor-cell-field"
                    key={field.attributeName}
                >
                    <span className="author-file-editor-cell-field-label">
                        {field.label}
                    </span>
                    {field.isCheckbox ? (
                        <input
                            type="checkbox"
                            checked={
                                cellAttributes[field.attributeName] !== "no"
                            }
                            onChange={(event) =>
                                onAttributeChanged(
                                    field.attributeName,
                                    event.currentTarget.checked ? "yes" : "no",
                                )
                            }
                        />
                    ) : (
                        <input
                            type="text"
                            className={inputClassName(field.attributeName)}
                            value={cellAttributes[field.attributeName] ?? ""}
                            placeholder={field.placeholder ?? ""}
                            onChange={(event) =>
                                onAttributeChanged(
                                    field.attributeName,
                                    event.currentTarget.value,
                                )
                            }
                        />
                    )}
                </label>
            ))}
        </div>
    );
}
