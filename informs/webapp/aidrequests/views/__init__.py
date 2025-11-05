# import os
# import glob
# from importlib import import_module

# # Get the directory of the current package
# views_dir = os.path.dirname(__file__)

# # Find all Python files in the directory (excluding __init__.py)
# for module_file in glob.glob(os.path.join(views_dir, "*.py")):
#     if not module_file.endswith('__init__.py'):
#         # Get the module name from the file path
#         module_name = os.path.basename(module_file)[:-3]
#         # Import the module
#         module = import_module(f".{module_name}", package=__name__)
#         # Add all public attributes of the module to the package's namespace
#         for attr in dir(module):
#             if not attr.startswith('_'):
#                 globals()[attr] = getattr(module, attr)
