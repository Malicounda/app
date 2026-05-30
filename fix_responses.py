import os

src_dir = r"c:\Users\HP\Desktop\Scodi\client\src"

for root, dirs, files in os.walk(src_dir):
    for file in files:
        if file.endswith(".tsx") or file.endswith(".ts"):
            file_path = os.path.join(root, file)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                
                if "return response.data || [];" in content:
                    new_content = content.replace(
                        "return response.data || [];", 
                        "return Array.isArray(response.data) ? response.data : [];"
                    )
                    with open(file_path, "w", encoding="utf-8", newline="") as f:
                        f.write(new_content)
                    print(f"Updated {file_path}")
            except Exception as e:
                print(f"Error on {file_path}: {e}")
